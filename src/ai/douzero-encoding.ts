// DouZero's published observation layout, adapted to our ranks (2=15, jokers=16/17).
// See THIRD_PARTY_NOTICES.md for the pinned upstream source and Apache-2.0 license.
import type { Card } from "../core/cards";
import { classifyPlay } from "../core/patterns";
import { generateLegalPlays } from "../core/plays";
import { unseenCards } from "./endgame";
import type { AiView } from "./strategy";

export type ModelSeat = "landlord" | "landlord_down" | "landlord_up";

export function encodeCards(cards: Card[]): Float32Array {
  const counts = new Uint8Array(15);
  for (const card of cards) counts[card.rank - 3]++;
  const result = new Float32Array(54);
  for (let rank = 0; rank < 13; rank++) {
    for (let copy = 0; copy < counts[rank]; copy++) result[rank * 4 + copy] = 1;
  }
  result[52] = counts[13] ? 1 : 0;
  result[53] = counts[14] ? 1 : 0;
  return result;
}

function oneHot(index: number, size: number): Float32Array {
  if (!Number.isInteger(index) || index < 0 || index >= size) throw new Error("Invalid public count");
  const result = new Float32Array(size);
  result[index] = 1;
  return result;
}

export function encodeObservation(view: AiView) {
  const landlord = view.landlordIndex;
  const pool = unseenCards(view);
  if (landlord === null || !pool) throw new Error("Incomplete public card information");
  const down = (landlord + 1) % 3;
  const up = (landlord + 2) % 3;
  const seat: ModelSeat = view.ownIndex === landlord ? "landlord" : view.ownIndex === down ? "landlord_down" : "landlord_up";
  const history = view.publicHistory ?? [];
  // Older saves without a complete action log use the rule fallback for this round.
  if (history.reduce((sum, action) => sum + action.cards.length, 0) !== view.playedCards.length) {
    throw new Error("This saved round has an incomplete action history");
  }
  const played: Card[][] = [[], [], []];
  const last: Card[][] = [[], [], []];
  let bombs = 0;
  for (const action of history) {
    played[action.playerIndex].push(...action.cards);
    last[action.playerIndex] = action.cards; // Passing clears this seat's last action.
    const type = classifyPlay(action.cards)?.type;
    if (type === "bomb" || type === "rocket") bombs++;
  }
  const hand = encodeCards(view.hand);
  const unknown = encodeCards(pool); // Combined unknown cards; never their allocation.
  const target = encodeCards(view.lastPlay?.cards ?? []);
  const bombCount = oneHot(bombs, 15);
  const teammate = view.ownIndex === down ? up : down;
  const parts = seat === "landlord"
    ? [hand, unknown, target, encodeCards(played[up]), encodeCards(played[down]),
      oneHot(view.remainingCardCounts[up] - 1, 17), oneHot(view.remainingCardCounts[down] - 1, 17), bombCount]
    : [hand, unknown, encodeCards(played[landlord]), encodeCards(played[teammate]), target,
      encodeCards(last[landlord]), encodeCards(last[teammate]),
      oneHot(view.remainingCardCounts[landlord] - 1, 20), oneHot(view.remainingCardCounts[teammate] - 1, 17), bombCount];
  const width = seat === "landlord" ? 373 : 484;
  const state = new Float32Array(width - 54);
  let offset = 0;
  for (const part of parts) { state.set(part, offset); offset += part.length; }
  const z = new Float32Array(5 * 162);
  const recent = history.slice(-15);
  recent.forEach((action, i) => z.set(encodeCards(action.cards), (15 - recent.length + i) * 54));

  // Enumerate only actions allowed by this game's rules. The model scores each
  // action, so it cannot invent a move or select a card the player doesn't hold.
  const actions = generateLegalPlays(view.hand, view.lastPlay?.pattern ?? null).map(play => play.cards);
  if (view.lastPlay) actions.push([]);
  if (!actions.length) throw new Error("No legal opening action");
  const x = new Float32Array(actions.length * width);
  actions.forEach((action, i) => {
    x.set(state, i * width);
    x.set(encodeCards(action), i * width + state.length);
  });
  return { seat, width, actions, x, z };
}
