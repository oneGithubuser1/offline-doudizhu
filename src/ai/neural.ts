import { InferenceSession, Tensor } from "onnxruntime-web";
import { encodeObservation, type ModelSeat } from "./douzero-encoding";
import { chooseModelOverride, type AiDecision, type AiView } from "./strategy";
import { removeCardsFromHand, type Card } from "../core/cards";
import { classifyPlay } from "../core/patterns";
import { generateLegalPlays } from "../core/plays";

export type ModelLoader = (seat: ModelSeat) => Promise<Uint8Array>;

export function isPrematureRocket(view: AiView, cards: Card[]): boolean {
  if (classifyPlay(cards)?.type !== "rocket") return false;
  const remaining = removeCardsFromHand(view.hand, cards);
  if (remaining.length === 0 || view.hand.length <= 8) return false;
  const opponentMinimum = Math.min(...view.remainingCardCounts.filter(
    (_, seat) => (seat === view.landlordIndex) !== (view.ownIndex === view.landlordIndex),
  ));
  if (opponentMinimum <= 4) return false;
  const keepsControlToFinish = generateLegalPlays(remaining, null)
    .some(play => play.cards.length === remaining.length);
  return !keepsControlToFinish;
}

export function createNeuralAgent(loadModel: ModelLoader) {
  const sessions = new Map<ModelSeat, Promise<InferenceSession>>();
  function sessionFor(seat: ModelSeat): Promise<InferenceSession> {
    let pending = sessions.get(seat);
    if (!pending) {
      pending = loadModel(seat).then(bytes => InferenceSession.create(bytes, {
        executionProviders: ["wasm"], graphOptimizationLevel: "all",
        intraOpNumThreads: 1, interOpNumThreads: 1,
      }));
      sessions.set(seat, pending);
      void pending.catch(() => sessions.delete(seat));
    }
    return pending;
  }

  return {
    async choose(view: AiView): Promise<AiDecision> {
      const tacticalOverride = chooseModelOverride(view);
      if (tacticalOverride) return tacticalOverride;
      const obs = encodeObservation(view);
      const finish = obs.actions.find(cards => cards.length === view.hand.length);
      if (finish) return { kind: "play", cards: finish };
      if (obs.actions.length === 1) {
        return obs.actions[0].length ? { kind: "play", cards: obs.actions[0] } : { kind: "pass" };
      }
      const eligible = new Set(obs.actions
        .map((cards, index) => ({ cards, index }))
        .filter(action => !isPrematureRocket(view, action.cards))
        .map(action => action.index));
      const session = await sessionFor(obs.seat);
      const history = new Tensor("float32", obs.z, [1, 5, 162]);
      let best = -Infinity;
      let bestIndex = -1;
      // Bounded batches keep memory and latency predictable for large airplanes.
      try {
        for (let start = 0; start < obs.actions.length; start += 128) {
          const count = Math.min(128, obs.actions.length - start);
          const state = new Tensor("float32", obs.x.slice(start * obs.width, (start + count) * obs.width), [count, obs.width]);
          try {
            const output = await session.run({ z: history, x: state });
            try {
              const values = output.values.data as Float32Array;
              if (values.length !== count) throw new Error("Model returned an unexpected action count");
              for (let i = 0; i < count; i++) {
                if (!Number.isFinite(values[i])) throw new Error("Model returned a nonfinite score");
                if (eligible.has(start + i) && values[i] > best) { best = values[i]; bestIndex = start + i; }
              }
            } finally { Object.values(output).forEach(tensor => tensor.dispose()); }
          } finally { state.dispose(); }
        }
      } finally { history.dispose(); }
      if (bestIndex < 0) throw new Error("Model did not choose a legal action");
      const cards = obs.actions[bestIndex];
      return cards.length ? { kind: "play", cards } : { kind: "pass" };
    },
    async dispose() {
      for (const session of sessions.values()) {
        try { await (await session).release(); } catch { /* Failed loads need no release. */ }
      }
      sessions.clear();
    },
  };
}
