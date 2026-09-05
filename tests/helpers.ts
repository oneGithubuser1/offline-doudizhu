import { type Card, type Suit } from "../src/core/cards";

const labelRank: Record<string, number> = {
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  "2": 15,
  X: 16,
  Y: 17,
};

const suits: Suit[] = ["spade", "heart", "club", "diamond"];

export function cards(text: string): Card[] {
  const occurrences = new Map<number, number>();
  return [...text.replaceAll(" ", "")].map((label, index) => {
    const rank = labelRank[label];
    if (!rank) throw new Error(`Unknown card label: ${label}`);
    const occurrence = occurrences.get(rank) ?? 0;
    occurrences.set(rank, occurrence + 1);
    return {
      id: `test-${rank}-${occurrence}-${index}`,
      rank,
      suit: rank >= 16 ? "joker" : suits[occurrence % 4],
    };
  });
}

export function seededRandom(seed = 123456): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
