import { describe, expect, it } from "vitest";
import { choosePlay, createAiView, type AiDecision, type AiView } from "../src/ai/strategy";
import { sortCards } from "../src/core/cards";
import { createNewSave, passTurn, playCards } from "../src/core/game";
import { generateLegalPlays } from "../src/core/plays";
import { seededRandom } from "./helpers";

function naivePlay(view: AiView): AiDecision {
  const legal = generateLegalPlays(view.hand, view.lastPlay?.pattern ?? null);
  if (legal.length === 0) return { kind: "pass" };
  const finishing = legal.find((play) => play.cards.length === view.hand.length);
  if (finishing) return { kind: "play", cards: finishing.cards };
  const choice = [...legal].sort((left, right) =>
    left.cards.length - right.cards.length || left.pattern.mainRank - right.pattern.mainRank,
  )[0];
  return { kind: "play", cards: choice.cards };
}

function playFixedGame(seed: number, smartLandlord: boolean): boolean {
  const random = seededRandom(seed);
  let data = createNewSave(random);
  data.round.phase = "playing";
  data.round.landlordIndex = 0;
  data.round.highestBid = 1;
  data.round.multiplier = 1;
  data.round.currentPlayerIndex = 0;
  data.round.bottomRevealed = true;
  data.round.players[0].role = "landlord";
  data.round.players[1].role = "farmer";
  data.round.players[2].role = "farmer";
  data.round.players[0].hand = sortCards([
    ...data.round.players[0].hand,
    ...data.round.bottomCards,
  ]);

  let actions = 0;
  while (data.round.phase === "playing" && actions < 500) {
    const index = data.round.currentPlayerIndex;
    const smart = index === 0 ? smartLandlord : !smartLandlord;
    const view = createAiView(data.round, index);
    const decision = smart ? choosePlay(view, random) : naivePlay(view);
    data = decision.kind === "play" && decision.cards
      ? playCards(data, index, decision.cards)
      : passTurn(data, index);
    actions += 1;
  }

  expect(actions).toBeLessThan(500);
  return data.round.winnerTeam === "landlord";
}

describe("AI相对强度", () => {
  it("地主和农民两种阵营都能明显压过只会最小牌跟出的基线", () => {
    let smartLandlordWins = 0;
    let smartFarmerWins = 0;
    const games = 20;
    for (let game = 0; game < games; game += 1) {
      if (playFixedGame(8100 + game, true)) smartLandlordWins += 1;
      if (!playFixedGame(9100 + game, false)) smartFarmerWins += 1;
    }
    expect(smartLandlordWins).toBeGreaterThanOrEqual(12);
    expect(smartFarmerWins).toBeGreaterThanOrEqual(12);
  }, 30_000);
});
