import { type Card, groupCardsByRank } from "./cards";

export type PlayType =
  | "single"
  | "pair"
  | "triple"
  | "triple_single"
  | "triple_pair"
  | "straight"
  | "pair_straight"
  | "triple_straight"
  | "airplane_single"
  | "airplane_pair"
  | "four_two_single"
  | "four_two_pair"
  | "bomb"
  | "rocket";

export interface PlayPattern {
  type: PlayType;
  mainRank: number;
  sequenceLength: number;
  cardCount: number;
}

export const PLAY_LABEL: Record<PlayType, string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  triple_single: "三带一",
  triple_pair: "三带二",
  straight: "顺子",
  pair_straight: "连对",
  triple_straight: "飞机",
  airplane_single: "飞机带单",
  airplane_pair: "飞机带对",
  four_two_single: "四带二",
  four_two_pair: "四带两对",
  bomb: "炸弹",
  rocket: "王炸",
};

function consecutive(ranks: number[]): boolean {
  if (ranks.length === 0 || ranks[ranks.length - 1] > 14) return false;
  return ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
}

function makePattern(
  type: PlayType,
  mainRank: number,
  cardCount: number,
  sequenceLength = 1,
): PlayPattern {
  return { type, mainRank, cardCount, sequenceLength };
}

function findAirplaneBody(
  counts: Map<number, number>,
  length: number,
  wing: "single" | "pair",
): number | null {
  for (let high = 14; high >= 3 + length - 1; high -= 1) {
    const low = high - length + 1;
    const body = Array.from({ length }, (_, index) => low + index);
    if (!body.every((rank) => (counts.get(rank) ?? 0) >= 3)) continue;

    const remaining = new Map(counts);
    for (const rank of body) {
      remaining.set(rank, (remaining.get(rank) ?? 0) - 3);
    }
    const remainder = [...remaining.values()].filter((count) => count > 0);

    if (wing === "single" && remainder.reduce((sum, count) => sum + count, 0) === length) {
      return high;
    }
    if (
      wing === "pair" &&
      remainder.length === length &&
      remainder.every((count) => count === 2)
    ) {
      return high;
    }
  }
  return null;
}

export function classifyPlay(cards: Card[]): PlayPattern | null {
  if (cards.length === 0) return null;

  const groups = groupCardsByRank(cards);
  const ranks = [...groups.keys()].sort((left, right) => left - right);
  const counts = new Map(ranks.map((rank) => [rank, groups.get(rank)?.length ?? 0]));
  const countValues = [...counts.values()].sort((left, right) => right - left);
  const count = cards.length;

  if (count === 2 && ranks.length === 2 && ranks[0] === 16 && ranks[1] === 17) {
    return makePattern("rocket", 17, 2);
  }
  if (count === 4 && ranks.length === 1) return makePattern("bomb", ranks[0], 4);
  if (count === 1) return makePattern("single", ranks[0], 1);
  if (count === 2 && ranks.length === 1) return makePattern("pair", ranks[0], 2);
  if (count === 3 && ranks.length === 1) return makePattern("triple", ranks[0], 3);

  if (count === 4 && countValues[0] === 3) {
    const tripleRank = ranks.find((rank) => counts.get(rank) === 3);
    if (tripleRank !== undefined) return makePattern("triple_single", tripleRank, 4);
  }
  if (count === 5 && countValues[0] === 3 && countValues[1] === 2) {
    const tripleRank = ranks.find((rank) => counts.get(rank) === 3);
    if (tripleRank !== undefined) return makePattern("triple_pair", tripleRank, 5);
  }

  if (count >= 5 && ranks.length === count && consecutive(ranks)) {
    return makePattern("straight", ranks[ranks.length - 1], count, count);
  }
  if (
    count >= 6 &&
    count % 2 === 0 &&
    ranks.length === count / 2 &&
    countValues.every((value) => value === 2) &&
    consecutive(ranks)
  ) {
    return makePattern("pair_straight", ranks[ranks.length - 1], count, count / 2);
  }
  if (
    count >= 6 &&
    count % 3 === 0 &&
    ranks.length === count / 3 &&
    countValues.every((value) => value === 3) &&
    consecutive(ranks)
  ) {
    return makePattern("triple_straight", ranks[ranks.length - 1], count, count / 3);
  }

  if (count >= 10 && count % 5 === 0) {
    const bodyLength = count / 5;
    const mainRank = findAirplaneBody(counts, bodyLength, "pair");
    if (bodyLength >= 2 && mainRank !== null) {
      return makePattern("airplane_pair", mainRank, count, bodyLength);
    }
  }
  if (count >= 8 && count % 4 === 0) {
    const bodyLength = count / 4;
    const mainRank = findAirplaneBody(counts, bodyLength, "single");
    if (bodyLength >= 2 && mainRank !== null) {
      return makePattern("airplane_single", mainRank, count, bodyLength);
    }
  }

  if (count === 6) {
    const fourRank = ranks.find((rank) => counts.get(rank) === 4);
    if (fourRank !== undefined) return makePattern("four_two_single", fourRank, 6);
  }
  if (count === 8) {
    const fourRank = ranks.find((rank) => counts.get(rank) === 4);
    if (fourRank !== undefined) {
      const remainder = ranks
        .filter((rank) => rank !== fourRank)
        .map((rank) => counts.get(rank));
      if (remainder.length === 2 && remainder.every((value) => value === 2)) {
        return makePattern("four_two_pair", fourRank, 8);
      }
    }
  }

  return null;
}

export function canBeat(candidate: PlayPattern, previous: PlayPattern | null): boolean {
  if (!previous) return true;
  if (candidate.type === "rocket") return previous.type !== "rocket";
  if (previous.type === "rocket") return false;
  if (candidate.type === "bomb" && previous.type !== "bomb") return true;
  if (previous.type === "bomb" && candidate.type !== "bomb") return false;
  if (candidate.type !== previous.type) return false;
  if (candidate.cardCount !== previous.cardCount) return false;
  if (candidate.sequenceLength !== previous.sequenceLength) return false;
  return candidate.mainRank > previous.mainRank;
}
