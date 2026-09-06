import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { env } from "onnxruntime-web";
import { createNeuralAgent } from "../src/ai/neural";
import { encodeObservation } from "../src/ai/douzero-encoding";
import { choosePlay, createAiView } from "../src/ai/strategy";
import { createNewSave, passTurn, playCards } from "../src/core/game";
import { removeCardsFromHand, sortCards } from "../src/core/cards";
import { generateLegalPlays } from "../src/core/plays";
import { classifyPlay } from "../src/core/patterns";
import { seededRandom } from "../tests/helpers";

env.wasm.numThreads = 1;
env.logLevel = "error";
const createFileAgent = (directory: string) => createNeuralAgent(
  seat => readFile(`${directory}/${seat}.onnx`),
);
const agent = createFileAgent(process.argv[5] ?? "public/models");

function deal(seed: number) {
  const data = createNewSave(seededRandom(seed));
  const landlord = seed % 3;
  data.round.phase = "playing";
  data.round.landlordIndex = landlord;
  data.round.highestBid = data.round.multiplier = 1;
  data.round.currentPlayerIndex = landlord;
  data.round.bottomRevealed = true;
  data.round.players.forEach((player, index) => player.role = index === landlord ? "landlord" : "farmer");
  data.round.players[landlord].hand = sortCards([...data.round.players[landlord].hand, ...data.round.bottomCards]);
  return data;
}

async function cases() {
  const samples: unknown[] = [];
  for (const seed of [8301, 8302, 8303]) {
    let data = deal(seed);
    const random = seededRandom(seed + 1);
    for (let action = 0; action < 35 && data.round.phase === "playing"; action++) {
      const view = createAiView(data.round, data.round.currentPlayerIndex);
      if ([0, 1, 2, 9, 10, 11, 24, 25, 26].includes(action)) {
        const obs = encodeObservation(view);
        samples.push({ view, actions: obs.actions, x: Array.from(obs.x), z: Array.from(obs.z) });
      }
      const decision = choosePlay(view, random);
      data = decision.kind === "play" ? playCards(data, view.ownIndex, decision.cards!) : passTurn(data, view.ownIndex);
    }
  }
  await writeFile(".ai-reference/encoding-cases.json", JSON.stringify(samples));
  console.log(`Generated ${samples.length} real public game observations for upstream parity checks.`);
}

async function benchmark() {
  const games = Number(process.argv[3] ?? 40);
  const seedBase = Number(process.argv[4] ?? 260905);
  assert(Number.isInteger(games) && games > 0 && games <= 1000);
  const latencies: number[] = [];
  const results: Array<{ seed: number; neuralLandlord: boolean; neuralWon: boolean; actions: number }> = [];
  const start = performance.now();
  for (let game = 0; game < games; game++) {
    const seed = seedBase + game;
    for (const neuralLandlord of [true, false]) {
      let data = deal(seed);
      const random = seededRandom(seed ^ 7319);
      let actions = 0;
      while (data.round.phase === "playing" && actions < 500) {
        const index = data.round.currentPlayerIndex;
        const view = createAiView(data.round, index);
        const neural = (index === data.round.landlordIndex) === neuralLandlord;
        const before = performance.now();
        // The baseline is the unchanged 0.5.2 choosePlay, including its endgame search.
        const decision = neural ? await agent.choose(view) : choosePlay(view, random);
        if (neural) latencies.push(performance.now() - before);
        const next = decision.kind === "play" ? playCards(data, index, decision.cards!) : passTurn(data, index);
        assert.notEqual(next, data, "AI returned an illegal action");
        data = next;
        actions++;
      }
      assert.equal(data.round.phase, "finished");
      assert.equal(data.profiles.reduce((sum, profile) => sum + profile.score, 0), 0);
      const neuralWon = (data.round.winnerTeam === "landlord") === neuralLandlord;
      results.push({ seed, neuralLandlord, neuralWon, actions });
    }
    if ((game + 1) % 5 === 0) console.log(`${game + 1}/${games} paired deals, new AI wins ${results.filter(r => r.neuralWon).length}/${results.length}`);
  }
  latencies.sort((a, b) => a - b);
  const summary = {
    baseline: "0.5.2 rule AI + sampled endgame minimax", upgraded: "DouZero ADP (offline ONNX/WASM)",
    seedBase, pairedDeals: games, games: results.length,
    neuralLandlordWins: results.filter(r => r.neuralLandlord && r.neuralWon).length,
    neuralFarmerWins: results.filter(r => !r.neuralLandlord && r.neuralWon).length,
    neuralWins: results.filter(r => r.neuralWon).length,
    inferenceCount: latencies.length, medianMs: latencies[Math.floor(latencies.length / 2)],
    p95Ms: latencies[Math.floor(latencies.length * .95)], maxMs: latencies.at(-1),
    elapsedSeconds: (performance.now() - start) / 1000, results,
  };
  await writeFile(".ai-reference/benchmark.json", JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
}

async function auditPasses() {
  const games = Number(process.argv[3] ?? 120);
  const seedBase = Number(process.argv[4] ?? 261005);
  const suspicious: unknown[] = [];
  let passesWithLegal = 0;
  let passesAgainstLandlord = 0;
  let zeroPlayFarmerLosses = 0;
  const earlyRockets: unknown[] = [];
  for (let game = 0; game < games; game++) {
    const seed = seedBase + game;
    let data = deal(seed);
    const records: unknown[] = [];
    let actions = 0;
    while (data.round.phase === "playing" && actions++ < 500) {
      const index = data.round.currentPlayerIndex;
      const view = createAiView(data.round, index);
      const legal = generateLegalPlays(view.hand, view.lastPlay?.pattern ?? null);
      const decision = await agent.choose(view);
      if (decision.kind === "play" && classifyPlay(decision.cards!)?.type === "rocket") {
        const remaining = removeCardsFromHand(view.hand, decision.cards!);
        const keepsControlToFinish = remaining.length === 0 || generateLegalPlays(remaining, null)
          .some(play => play.cards.length === remaining.length);
        const opponentMinimum = Math.min(...view.remainingCardCounts
          .filter((_, seat) => (seat === view.landlordIndex) !== (view.ownIndex === view.landlordIndex)));
        if (view.hand.length > 8 && opponentMinimum > 4 && !keepsControlToFinish) {
          earlyRockets.push({ seed, action: actions, seat: index, handCount: view.hand.length,
            opponentMinimum, target: view.lastPlay?.pattern ?? null,
            ordinaryReplies: legal.filter(play => play.pattern.type !== "bomb" && play.pattern.type !== "rocket").length });
        }
      }
      if (decision.kind === "pass" && legal.length > 0) {
        passesWithLegal++;
        if (view.lastPlayBy === view.landlordIndex) passesAgainstLandlord++;
        records.push({ action: actions, seat: index, lastPlayBy: view.lastPlayBy,
          landlordRemaining: view.remainingCardCounts[view.landlordIndex!],
          counts: view.remainingCardCounts, hand: view.hand.map(card => card.rank),
          target: view.lastPlay?.pattern, legal: legal.map(play => play.pattern) });
      }
      data = decision.kind === "play"
        ? playCards(data, index, decision.cards!)
        : passTurn(data, index);
    }
    assert.equal(data.round.phase, "finished");
    const silentLosers = data.round.players
      .map((player, seat) => ({ player, seat }))
      .filter(({ player, seat }) => seat !== data.round.landlordIndex && player.playedHands === 0);
    if (data.round.winnerTeam === "landlord" && silentLosers.length > 0) {
      zeroPlayFarmerLosses += silentLosers.length;
      suspicious.push({ seed, landlord: data.round.landlordIndex,
        silentSeats: silentLosers.map(item => item.seat), records });
    }
  }
  const summary = { games, seedBase, passesWithLegal, passesAgainstLandlord,
    zeroPlayFarmerLosses, earlyRockets, suspicious };
  await writeFile(".ai-reference/pass-audit.json", JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ games, seedBase, passesWithLegal, passesAgainstLandlord,
    zeroPlayFarmerLosses, suspiciousGames: suspicious.length,
    earlyRockets: earlyRockets.length, earlyRocketSamples: earlyRockets.slice(0, 8) }, null, 2));
}

async function compareModels() {
  const games = Number(process.argv[3] ?? 80);
  const seedBase = Number(process.argv[4] ?? 262005);
  const firstDirectory = process.argv[5] ?? "public/models";
  const secondDirectory = process.argv[6] ?? ".ai-reference/wp-onnx/exported";
  assert(Number.isInteger(games) && games > 0 && games <= 1000);
  const first = createFileAgent(firstDirectory);
  const second = createFileAgent(secondDirectory);
  const results: Array<{ seed: number; firstLandlord: boolean; firstWon: boolean; actions: number }> = [];
  const latencies: number[] = [];
  try {
    for (let game = 0; game < games; game++) {
      const seed = seedBase + game;
      for (const firstLandlord of [true, false]) {
        let data = deal(seed);
        let actions = 0;
        while (data.round.phase === "playing" && actions < 500) {
          const index = data.round.currentPlayerIndex;
          const view = createAiView(data.round, index);
          const useFirst = ((index === data.round.landlordIndex) === firstLandlord);
          const before = performance.now();
          const decision = await (useFirst ? first : second).choose(view);
          latencies.push(performance.now() - before);
          const next = decision.kind === "play"
            ? playCards(data, index, decision.cards!)
            : passTurn(data, index);
          assert.notEqual(next, data, "AI returned an illegal action");
          data = next;
          actions++;
        }
        assert.equal(data.round.phase, "finished");
        const firstWon = (data.round.winnerTeam === "landlord") === firstLandlord;
        results.push({ seed, firstLandlord, firstWon, actions });
      }
      if ((game + 1) % 10 === 0) {
        console.log(`${game + 1}/${games} paired deals, first model wins ${results.filter(r => r.firstWon).length}/${results.length}`);
      }
    }
    latencies.sort((a, b) => a - b);
    const summary = {
      firstDirectory, secondDirectory, seedBase, pairedDeals: games, games: results.length,
      firstLandlordWins: results.filter(r => r.firstLandlord && r.firstWon).length,
      firstFarmerWins: results.filter(r => !r.firstLandlord && r.firstWon).length,
      firstWins: results.filter(r => r.firstWon).length,
      secondWins: results.filter(r => !r.firstWon).length,
      medianDecisionMs: latencies[Math.floor(latencies.length / 2)],
      p95DecisionMs: latencies[Math.floor(latencies.length * .95)],
      results,
    };
    await writeFile(".ai-reference/model-comparison.json", JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
  } finally {
    await Promise.all([first.dispose(), second.dispose()]);
  }
}

async function main() {
  try {
    if (process.argv[2] === "cases") await cases();
    else if (process.argv[2] === "audit") await auditPasses();
    else if (process.argv[2] === "compare") await compareModels();
    else await benchmark();
  }
  finally { await agent.dispose(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
