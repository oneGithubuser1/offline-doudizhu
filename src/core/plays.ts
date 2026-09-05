import { type Card, groupCardsByRank, sortCards } from "./cards";
import { canBeat, classifyPlay, type PlayPattern } from "./patterns";

export interface LegalPlay {
  cards: Card[];
  pattern: PlayPattern;
}

function take(groups: Map<number, Card[]>, rank: number, count: number): Card[] {
  return (groups.get(rank) ?? []).slice(0, count);
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

function availableRuns(
  groups: Map<number, Card[]>,
  minimumCount: number,
  minimumLength: number,
): number[][] {
  const runs: number[][] = [];
  for (let start = 3; start <= 14; start += 1) {
    for (let length = minimumLength; start + length - 1 <= 14; length += 1) {
      const ranks = range(start, length);
      if (ranks.every((rank) => (groups.get(rank)?.length ?? 0) >= minimumCount)) {
        runs.push(ranks);
      } else {
        break;
      }
    }
  }
  return runs;
}

function chooseSingles(
  groups: Map<number, Card[]>,
  count: number,
  limit = 240,
): Card[][] {
  const ranks = [...groups.keys()].sort((left, right) => left - right);
  const result: Card[][] = [];

  const visit = (rankIndex: number, remaining: number, selected: Card[]) => {
    if (result.length >= limit) return;
    if (remaining === 0) {
      result.push(selected);
      return;
    }
    if (rankIndex >= ranks.length) return;

    const rank = ranks[rankIndex];
    const cards = groups.get(rank) ?? [];
    const maximum = Math.min(cards.length, remaining);
    for (let amount = 0; amount <= maximum; amount += 1) {
      visit(rankIndex + 1, remaining - amount, [...selected, ...cards.slice(0, amount)]);
    }
  };

  visit(0, count, []);
  return result;
}

function choosePairs(
  groups: Map<number, Card[]>,
  count: number,
  limit = 160,
): Card[][] {
  const ranks = [...groups.entries()]
    .filter(([, cards]) => cards.length >= 2)
    .map(([rank]) => rank)
    .sort((left, right) => left - right);
  const result: Card[][] = [];

  const visit = (start: number, remaining: number, selected: Card[]) => {
    if (result.length >= limit) return;
    if (remaining === 0) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= ranks.length - remaining; index += 1) {
      const pair = take(groups, ranks[index], 2);
      visit(index + 1, remaining - 1, [...selected, ...pair]);
    }
  };

  visit(0, count, []);
  return result;
}

function subtractCards(groups: Map<number, Card[]>, used: Card[]): Map<number, Card[]> {
  const usedIds = new Set(used.map((card) => card.id));
  return new Map(
    [...groups.entries()]
      .map(([rank, cards]) => [rank, cards.filter((card) => !usedIds.has(card.id))] as const)
      .filter(([, cards]) => cards.length > 0),
  );
}

export function generateLegalPlays(
  hand: Card[],
  previous: PlayPattern | null = null,
): LegalPlay[] {
  const groups = groupCardsByRank(sortCards(hand));
  const candidates: LegalPlay[] = [];
  const seen = new Set<string>();

  const add = (cards: Card[]) => {
    const pattern = classifyPlay(cards);
    if (!pattern || !canBeat(pattern, previous)) return;
    const rankKey = [...cards].map((card) => card.rank).sort((a, b) => a - b).join(",");
    const key = `${pattern.type}:${rankKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ cards: sortCards(cards), pattern });
  };

  for (const [rank, cards] of groups) {
    add(cards.slice(0, 1));
    if (cards.length >= 2) add(cards.slice(0, 2));
    if (cards.length >= 3) add(cards.slice(0, 3));
    if (cards.length === 4) add(cards);

    if (cards.length >= 3) {
      for (const [wingRank, wingCards] of groups) {
        if (wingRank === rank) continue;
        add([...cards.slice(0, 3), wingCards[0]]);
        if (wingCards.length >= 2) add([...cards.slice(0, 3), ...wingCards.slice(0, 2)]);
      }
    }
  }

  if (groups.has(16) && groups.has(17)) {
    add([...(groups.get(16) ?? []), ...(groups.get(17) ?? [])]);
  }

  for (const ranks of availableRuns(groups, 1, 5)) {
    add(ranks.flatMap((rank) => take(groups, rank, 1)));
  }
  for (const ranks of availableRuns(groups, 2, 3)) {
    add(ranks.flatMap((rank) => take(groups, rank, 2)));
  }

  for (const ranks of availableRuns(groups, 3, 2)) {
    const body = ranks.flatMap((rank) => take(groups, rank, 3));
    add(body);

    const remaining = subtractCards(groups, body);
    for (const wings of chooseSingles(remaining, ranks.length)) add([...body, ...wings]);
    for (const wings of choosePairs(remaining, ranks.length)) add([...body, ...wings]);
  }

  for (const [rank, cards] of groups) {
    if (cards.length !== 4) continue;
    const remaining = subtractCards(groups, cards);
    for (const wings of chooseSingles(remaining, 2)) add([...cards, ...wings]);
    for (const wings of choosePairs(remaining, 2)) add([...cards, ...wings]);
  }

  return candidates;
}
