export type Suit = "spade" | "heart" | "club" | "diamond" | "joker";

export interface Card {
  id: string;
  rank: number;
  suit: Suit;
}

export const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

export const RANK_LABEL: Record<number, string> = {
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
  15: "2",
  16: "小王",
  17: "大王",
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  club: "♣",
  diamond: "♦",
  joker: "★",
};

export function createDeck(): Card[] {
  const suits: Suit[] = ["spade", "heart", "club", "diamond"];
  const deck: Card[] = [];

  for (let rank = 3; rank <= 15; rank += 1) {
    for (const suit of suits) {
      deck.push({ id: `${rank}-${suit}`, rank, suit });
    }
  }

  deck.push({ id: "16-joker", rank: 16, suit: "joker" });
  deck.push({ id: "17-joker", rank: 17, suit: "joker" });
  return deck;
}

export function shuffleCards(cards: Card[], random = Math.random): Card[] {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function sortCards(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    joker: 5,
    spade: 4,
    heart: 3,
    club: 2,
    diamond: 1,
  };
  return [...cards].sort(
    (left, right) =>
      right.rank - left.rank || suitOrder[right.suit] - suitOrder[left.suit],
  );
}

export function groupCardsByRank(cards: Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of cards) {
    const group = groups.get(card.rank) ?? [];
    group.push(card);
    groups.set(card.rank, group);
  }
  return groups;
}

export function removeCardsFromHand(hand: Card[], selected: Card[]): Card[] {
  const ids = new Set(selected.map((card) => card.id));
  return hand.filter((card) => !ids.has(card.id));
}

export function sameCardSet(left: Card[], right: Card[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right.map((card) => card.id));
  return left.every((card) => rightIds.has(card.id));
}
