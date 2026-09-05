import { type Card, groupCardsByRank, removeCardsFromHand } from "../core/cards";
import { generateLegalPlays, type LegalPlay } from "../core/plays";
import { type ActivePlay, type PlayerRole, type RoundState } from "../core/game";
import { classifyPlay } from "../core/patterns";
import { chooseEndgame, unseenCards } from "./endgame";

export interface AiView {
  ownIndex: number;
  ownRole: PlayerRole;
  hand: Card[];
  highestBid: number;
  landlordIndex: number | null;
  lastPlay: ActivePlay | null;
  lastPlayBy: number | null;
  remainingCardCounts: number[];
  playedCards: Card[];
  publicBottomCards?: Card[];
  passCount?: number;
  publicHistory?: Array<{ playerIndex: number; cards: Card[] }>;
}

export interface AiDecision {
  kind: "play" | "pass";
  cards?: Card[];
}

const COMBINATION_BONUS: Record<string, number> = {
  airplane_pair: 28,
  airplane_single: 25,
  triple_straight: 23,
  pair_straight: 18,
  straight: 16,
  triple_pair: 11,
  triple_single: 9,
  four_two_pair: 8,
  four_two_single: 6,
  triple: 4,
  pair: 2,
  single: 0,
  bomb: -30,
  rocket: -38,
};

export function createAiView(round: RoundState, ownIndex: number): AiView {
  return {
    ownIndex,
    ownRole: round.players[ownIndex].role,
    hand: [...round.players[ownIndex].hand],
    highestBid: round.highestBid,
    landlordIndex: round.landlordIndex,
    lastPlay: round.lastPlay
      ? { cards: [...round.lastPlay.cards], pattern: { ...round.lastPlay.pattern } }
      : null,
    lastPlayBy: round.lastPlayBy,
    remainingCardCounts: round.players.map((player) => player.hand.length),
    playedCards: [...round.playedCards],
    publicBottomCards: round.bottomRevealed ? [...round.bottomCards] : [],
    passCount: round.passCount,
    publicHistory: (round.actionHistory ?? [])
      .filter(record => record.action.kind === "play" || record.action.kind === "pass")
      .map(record => ({ playerIndex: record.playerIndex, cards: [...(record.action.cards ?? [])] })),
  };
}

function signature(hand: Card[]): string {
  const counts = groupCardsByRank(hand);
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rank, cards]) => `${rank}:${cards.length}`)
    .join("|");
}

function runs(ranks: number[], minimumLength: number): number[] {
  const bonuses: number[] = [];
  let current = 0;
  let previous = -10;
  for (const rank of ranks.filter((value) => value <= 14)) {
    current = rank === previous + 1 ? current + 1 : 1;
    previous = rank;
    if (current >= minimumLength) bonuses.push(current);
  }
  return bonuses;
}

function estimateTurns(hand: Card[]): number {
  if (hand.length === 0) return 0;
  const groups = groupCardsByRank(hand);
  const entries = [...groups.entries()].sort(([left], [right]) => left - right);
  let turns = entries.length;
  const allRanks = entries.map(([rank]) => rank);
  const pairRanks = entries.filter(([, cards]) => cards.length >= 2).map(([rank]) => rank);
  const tripleRanks = entries.filter(([, cards]) => cards.length >= 3).map(([rank]) => rank);

  const tripleRuns = runs(tripleRanks, 2);
  const pairRuns = runs(pairRanks, 3);
  const singleRuns = runs(allRanks, 5);
  if (tripleRuns.length) turns -= Math.min(4, Math.max(...tripleRuns) - 1);
  if (pairRuns.length) turns -= Math.min(4, Math.max(...pairRuns) - 1);
  if (singleRuns.length) turns -= Math.min(5, Math.max(...singleRuns) - 1);

  const triples = entries.filter(([, cards]) => cards.length === 3).length;
  const wings = entries.filter(([, cards]) => cards.length === 1 || cards.length === 2).length;
  turns -= Math.min(triples, wings);
  return Math.max(1, turns);
}

function highCardCost(cards: Card[]): number {
  return cards.reduce((cost, card) => {
    if (card.rank === 17) return cost + 11;
    if (card.rank === 16) return cost + 8;
    if (card.rank === 15) return cost + 4.2;
    if (card.rank === 14) return cost + 1.6;
    return cost;
  }, 0);
}

function openingCost(play: LegalPlay): number {
  let cost = highCardCost(play.cards) * 2.2 + play.pattern.mainRank * 0.7;
  cost -= (COMBINATION_BONUS[play.pattern.type] ?? 0) + play.cards.length * 2.1;
  if (play.pattern.type === "single") cost += play.pattern.mainRank >= 14 ? 22 : 5;
  if (play.pattern.type === "pair" && play.pattern.mainRank >= 15) cost += 13;
  if (play.pattern.type === "bomb" || play.pattern.type === "rocket") cost += 55;
  return cost;
}

function expansionScore(play: LegalPlay, remaining: Card[]): number {
  return (
    estimateTurns(remaining) * 30 +
    remaining.length * 1.2 +
    openingCost(play) * 0.22
  );
}

function exactTurnCount(hand: Card[], memo = new Map<string, number>()): number {
  if (hand.length === 0) return 0;
  const key = signature(hand);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let best = hand.length;
  for (const play of generateLegalPlays(hand, null)) {
    const remaining = removeCardsFromHand(hand, play.cards);
    best = Math.min(best, 1 + exactTurnCount(remaining, memo));
    if (best === 1) break;
  }
  memo.set(key, best);
  return best;
}

interface PlanNode {
  hand: Card[];
  first: LegalPlay;
  firstCost: number;
}

function plannedLead(hand: Card[]): LegalPlay | null {
  const immediate = generateLegalPlays(hand, null);
  if (immediate.length === 0) return null;
  const finish = immediate
    .filter((play) => play.cards.length === hand.length)
    .sort((left, right) => openingCost(left) - openingCost(right))[0];
  if (finish) return finish;

  if (hand.length <= 10) {
    const memo = new Map<string, number>();
    return immediate
      .map((play) => ({
        play,
        turns: 1 + exactTurnCount(removeCardsFromHand(hand, play.cards), memo),
      }))
      .sort((left, right) =>
        left.turns - right.turns || openingCost(left.play) - openingCost(right.play),
      )[0].play;
  }

  let frontier: PlanNode[] = immediate
    .map((play) => ({
      hand: removeCardsFromHand(hand, play.cards),
      first: play,
      firstCost: openingCost(play),
    }))
    .sort((left, right) =>
      expansionScore(left.first, left.hand) - expansionScore(right.first, right.hand),
    )
    .slice(0, 44);
  const seen = new Map(frontier.map((node) => [signature(node.hand), 1]));

  for (let depth = 2; depth <= 9; depth += 1) {
    const nextNodes: PlanNode[] = [];
    const solutions: PlanNode[] = [];

    for (const node of frontier) {
      const options = generateLegalPlays(node.hand, null)
        .map((play) => ({ play, remaining: removeCardsFromHand(node.hand, play.cards) }))
        .sort((left, right) => expansionScore(left.play, left.remaining) - expansionScore(right.play, right.remaining))
        .slice(0, 32);

      for (const option of options) {
        const candidate: PlanNode = {
          hand: option.remaining,
          first: node.first,
          firstCost: node.firstCost,
        };
        if (option.remaining.length === 0) {
          solutions.push(candidate);
          continue;
        }
        const key = signature(option.remaining);
        if ((seen.get(key) ?? Number.POSITIVE_INFINITY) <= depth) continue;
        seen.set(key, depth);
        nextNodes.push(candidate);
      }
    }

    if (solutions.length) {
      return solutions.sort((left, right) => left.firstCost - right.firstCost)[0].first;
    }

    frontier = nextNodes
      .sort((left, right) =>
        estimateTurns(left.hand) * 40 + left.hand.length + left.firstCost * 0.12 -
        (estimateTurns(right.hand) * 40 + right.hand.length + right.firstCost * 0.12),
      )
      .slice(0, 44);
    if (frontier.length === 0) break;
  }

  return immediate.sort((left, right) => {
    const leftHand = removeCardsFromHand(hand, left.cards);
    const rightHand = removeCardsFromHand(hand, right.cards);
    return expansionScore(left, leftHand) - expansionScore(right, rightHand);
  })[0];
}

function lookAheadTurns(hand: Card[], depth: number, memo = new Map<string, number>()): number {
  if (hand.length === 0) return 0;
  if (depth <= 0) return estimateTurns(hand);
  const key = `${depth}/${signature(hand)}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const options = generateLegalPlays(hand, null)
    .map((play) => ({ play, remaining: removeCardsFromHand(hand, play.cards) }))
    .sort((left, right) => expansionScore(left.play, left.remaining) - expansionScore(right.play, right.remaining))
    .slice(0, 26);
  let best = estimateTurns(hand);
  for (const option of options) {
    best = Math.min(best, 1 + lookAheadTurns(option.remaining, depth - 1, memo));
  }
  memo.set(key, best);
  return best;
}

export function chooseBid(hand: Card[], highestBid: number, random = Math.random): number {
  const groups = groupCardsByRank(hand);
  let strength = 0;
  const smallJoker = groups.has(16);
  const bigJoker = groups.has(17);

  if (bigJoker) strength += 3.2;
  if (smallJoker) strength += 2.1;
  if (bigJoker && smallJoker) strength += 3.5;
  strength += (groups.get(15)?.length ?? 0) * 1.45;
  strength += (groups.get(14)?.length ?? 0) * 0.55;
  for (const cards of groups.values()) {
    if (cards.length === 4) strength += 5.2;
    else if (cards.length === 3) strength += 1;
    else if (cards.length === 2) strength += 0.25;
  }
  strength += Math.max(0, 8 - lookAheadTurns(hand, 2)) * 0.62;
  strength += (random() - 0.5) * 0.7;

  const desired = strength >= 10.2 ? 3 : strength >= 7.1 ? 2 : strength >= 4.7 ? 1 : 0;
  return desired > highestBid ? desired : 0;
}

function isOpponent(view: AiView, index: number): boolean {
  if (view.landlordIndex === null) return true;
  if (view.ownRole === "landlord") return index !== view.ownIndex;
  return index === view.landlordIndex;
}

function isTeammate(view: AiView, index: number | null): boolean {
  return index !== null &&
    view.ownRole === "farmer" &&
    view.landlordIndex !== null &&
    index !== view.landlordIndex &&
    index !== view.ownIndex;
}

function isBomb(play: LegalPlay): boolean {
  return play.pattern.type === "bomb" || play.pattern.type === "rocket";
}

function bestPlannedPlay(hand: Card[], plays: LegalPlay[]): LegalPlay {
  return [...plays].sort((left, right) => {
    const leftHand = removeCardsFromHand(hand, left.cards);
    const rightHand = removeCardsFromHand(hand, right.cards);
    return expansionScore(left, leftHand) - expansionScore(right, rightHand);
  })[0];
}

function highestMainRank(plays: LegalPlay[]): LegalPlay {
  return [...plays].sort((left, right) => right.pattern.mainRank - left.pattern.mainRank)[0];
}

function lowestNaturalSingle(hand: Card[], plays: LegalPlay[]): LegalPlay | null {
  const groups = groupCardsByRank(hand);
  const singles = plays
    .filter((play) => play.pattern.type === "single")
    .sort((left, right) => left.pattern.mainRank - right.pattern.mainRank);
  return singles.find((play) => (groups.get(play.pattern.mainRank)?.length ?? 0) === 1) ?? singles[0] ?? null;
}

function tacticalLead(view: AiView, legal: LegalPlay[]): LegalPlay | null {
  const nextIndex = (view.ownIndex + 1) % 3;
  const teammateIsNext = isTeammate(view, nextIndex);
  if (teammateIsNext && view.remainingCardCounts[nextIndex] === 1) {
    return lowestNaturalSingle(view.hand, legal);
  }

  const opponentCounts = view.remainingCardCounts
    .map((count, index) => ({ count, index }))
    .filter(({ index }) => isOpponent(view, index));
  const opponentHasOne = opponentCounts.some(({ count }) => count === 1);
  const opponentHasTwo = opponentCounts.some(({ count }) => count === 2);

  if (opponentHasOne) {
    const safeNonSingles = legal.filter(
      (play) => play.pattern.type !== "single" && !isBomb(play),
    );
    if (safeNonSingles.length > 0) return bestPlannedPlay(view.hand, safeNonSingles);
    const singles = legal.filter((play) => play.pattern.type === "single");
    if (singles.length > 0) return highestMainRank(singles);
    const nonBombs = legal.filter((play) => !isBomb(play));
    return highestMainRank(nonBombs.length > 0 ? nonBombs : legal);
  }

  if (opponentHasTwo) {
    const cannotFinishInOnePlay = legal.filter(
      (play) => play.cards.length >= 3 && !isBomb(play),
    );
    if (cannotFinishInOnePlay.length > 0) {
      return bestPlannedPlay(view.hand, cannotFinishInOnePlay);
    }
    const singles = legal.filter((play) => play.pattern.type === "single");
    if (singles.length > 0) return highestMainRank(singles);
    const nonBombs = legal.filter((play) => !isBomb(play));
    return highestMainRank(nonBombs.length > 0 ? nonBombs : legal);
  }

  return null;
}

type TablePosition = "landlord" | "landlord_up" | "landlord_down" | "unknown";

function tablePosition(view: AiView): TablePosition {
  if (view.landlordIndex === null) return "unknown";
  if (view.ownIndex === view.landlordIndex) return "landlord";
  if (view.ownIndex === (view.landlordIndex + 1) % 3) return "landlord_down";
  return "landlord_up";
}

function gatekeeperDecision(view: AiView, legal: LegalPlay[]): AiDecision | null {
  if (!view.lastPlay || tablePosition(view) !== "landlord_up") return null;
  const type = view.lastPlay.pattern.type;
  if (type !== "single" && type !== "pair") return null;
  if (view.lastPlay.pattern.mainRank > 10) return null;
  // A teammate near going out deserves the lead. Do not overtake merely
  // because our seat happens to be immediately before the landlord.
  if (isTeammate(view, view.lastPlayBy) && view.remainingCardCounts[view.lastPlayBy!] <= 2) return null;

  const groups = groupCardsByRank(view.hand);
  const matching = legal
    .filter((play) => play.pattern.type === type)
    .filter((play) => (groups.get(play.pattern.mainRank)?.length ?? 0) <= (type === "single" ? 2 : 3));
  if (matching.length === 0) return { kind: "pass" };

  const landlordCards = view.landlordIndex === null
    ? 20
    : view.remainingCardCounts[view.landlordIndex];
  const ordinary = matching.filter((play) => play.pattern.mainRank <= 14);
  const candidates = landlordCards <= 2
    ? matching
    : ordinary.length > 0 ? ordinary : matching;
  const strongestAffordable = [...candidates]
    .sort((left, right) => {
      const leftGroupSize = groups.get(left.pattern.mainRank)?.length ?? 4;
      const rightGroupSize = groups.get(right.pattern.mainRank)?.length ?? 4;
      if (leftGroupSize !== rightGroupSize) return leftGroupSize - rightGroupSize;
      return right.pattern.mainRank - left.pattern.mainRank;
    })[0];

  const rise = strongestAffordable.pattern.mainRank - view.lastPlay.pattern.mainRank;
  if (rise <= 1 && strongestAffordable.pattern.mainRank < 8 && landlordCards > 4) {
    return { kind: "pass" };
  }
  return { kind: "play", cards: strongestAffordable.cards };
}

function landlordUpLead(view: AiView, legal: LegalPlay[]): LegalPlay | null {
  if (tablePosition(view) !== "landlord_up") return null;
  const nonBombGroups = legal.filter((play) => play.cards.length >= 2 && !isBomb(play));
  if (nonBombGroups.length > 0) return bestPlannedPlay(view.hand, nonBombGroups);

  const groups = groupCardsByRank(view.hand);
  const naturalSingles = legal
    .filter((play) => play.pattern.type === "single")
    .filter((play) => (groups.get(play.pattern.mainRank)?.length ?? 0) === 1)
    .filter((play) => play.pattern.mainRank <= 14)
    .sort((left, right) => right.pattern.mainRank - left.pattern.mainRank);
  return naturalSingles[0] ?? null;
}

function responseScore(play: LegalPlay, view: AiView, memo: Map<string, number>): number {
  const remaining = removeCardsFromHand(view.hand, play.cards);
  if (remaining.length === 0) return 100_000;
  const opponentCounts = view.remainingCardCounts.filter((_, index) => isOpponent(view, index));
  const danger = Math.min(...opponentCounts) <= 2;
  const searchDepth = remaining.length <= 10 ? 3 : 2;
  const futureTurns = remaining.length <= 10
    ? exactTurnCount(remaining, memo)
    : lookAheadTurns(remaining, searchDepth, memo);
  let score = -futureTurns * 48 - highCardCost(play.cards) * (danger ? 0.35 : 1.6);
  score -= play.pattern.mainRank * 0.85;
  score += COMBINATION_BONUS[play.pattern.type] ?? 0;
  if (isBomb(play)) score -= danger ? 10 : 85;
  if (danger) score += play.cards.length * 2.4;
  const groups = groupCardsByRank(view.hand);
  const usedGroups = groupCardsByRank(play.cards);
  for (const [rank, used] of usedGroups) {
    const count = groups.get(rank)!.length;
    if (used.length < count) score -= (count === 4 ? 65 : count === 3 ? 14 : 5) * (danger ? .25 : 1);
  }
  if (groups.has(16) && groups.has(17) && play.pattern.type !== "rocket" && play.cards.some(card => card.rank >= 16)) {
    score -= danger ? 4 : 35;
  }

  const nextIndex = (view.ownIndex + 1) % 3;
  if (danger && isOpponent(view, nextIndex) && view.remainingCardCounts[nextIndex] === 1) {
    score += play.pattern.type === "single" ? play.pattern.mainRank * 9 : 70;
  }
  if (
    danger &&
    isOpponent(view, nextIndex) &&
    view.remainingCardCounts[nextIndex] === 2 &&
    view.lastPlay?.pattern.type === "pair"
  ) {
    score += play.pattern.type === "pair" ? play.pattern.mainRank * 8 : 60;
  }
  if (
    view.lastPlayBy !== null &&
    isOpponent(view, view.lastPlayBy) &&
    view.remainingCardCounts[view.lastPlayBy] <= 2
  ) {
    score += play.pattern.type === "single" ? play.pattern.mainRank * 5 : 42;
  }
  return score;
}

function publicUnbeatable(play: LegalPlay, view: AiView): boolean {
  if (play.pattern.type === "rocket") return true;
  const unseen = unseenCards(view);
  if (!unseen) return false;
  const groups = groupCardsByRank(unseen);
  const enemyMax = Math.max(...view.remainingCardCounts.filter((_, index) => isOpponent(view, index)));
  if (enemyMax >= 2 && groups.has(16) && groups.has(17)) return false;
  const bombs = [...groups].filter(([, cards]) => cards.length === 4);
  if (enemyMax >= 4 && bombs.some(([rank]) => play.pattern.type !== "bomb" || rank > play.pattern.mainRank)) return false;
  if (play.pattern.type === "bomb") return true;
  if (play.cards.length > enemyMax) return true;
  const count = play.pattern.type === "single" ? 1 : play.pattern.type === "pair" ? 2 : play.pattern.type === "triple" ? 3 : 0;
  return count > 0 && ![...groups].some(([rank, cards]) => rank > play.pattern.mainRank && cards.length >= count);
}

function chooseHeuristicPlay(view: AiView, random: () => number): AiDecision {
  const legal = generateLegalPlays(view.hand, view.lastPlay?.pattern ?? null);
  if (legal.length === 0) return { kind: "pass" };

  const finishing = legal
    .filter((play) => play.cards.length === view.hand.length)
    .sort((left, right) => openingCost(left) - openingCost(right))[0];
  if (finishing) return { kind: "play", cards: finishing.cards };

  // Keep the initiative when a controlling card/bomb is followed by one
  // complete hand. Counting only the number of hands misses this forced win.
  if (view.hand.length <= 10) {
    const control = legal.find(play => classifyPlay(removeCardsFromHand(view.hand, play.cards)) && publicUnbeatable(play, view));
    if (control) return { kind: "play", cards: control.cards };
  }

  const nextIndex = (view.ownIndex + 1) % 3;
  const imminent = view.lastPlay && isOpponent(view, nextIndex) &&
    ((view.remainingCardCounts[nextIndex] === 1 && view.lastPlay.pattern.type === "single") ||
      (view.remainingCardCounts[nextIndex] === 2 && view.lastPlay.pattern.type === "pair"));
  if (imminent) {
    const target = view.lastPlay!;
    if (isTeammate(view, view.lastPlayBy) && publicUnbeatable(target, view)) return { kind: "pass" };
    const matching = legal.filter(play => play.pattern.type === target.pattern.type);
    const guard = matching.length ? highestMainRank(matching) : legal.find(isBomb);
    if (guard) return { kind: "play", cards: guard.cards };
  }

  const gatekeeper = gatekeeperDecision(view, legal);
  if (gatekeeper) return gatekeeper;

  const teammateLed = isTeammate(view, view.lastPlayBy);
  if (teammateLed) {
    const landlordCards = view.landlordIndex === null
      ? Number.POSITIVE_INFINITY
      : view.remainingCardCounts[view.landlordIndex];
    const mustGuardSingle = landlordCards === 1 && view.lastPlay?.pattern.type === "single";
    const mustGuardPair = landlordCards === 2 && view.lastPlay?.pattern.type === "pair";
    if (!mustGuardSingle && !mustGuardPair) {
      return { kind: "pass" };
    }
  }

  if (view.lastPlay === null) {
    const planned = tacticalLead(view, legal) ?? landlordUpLead(view, legal) ?? plannedLead(view.hand);
    return planned ? { kind: "play", cards: planned.cards } : { kind: "pass" };
  }

  const opponentDanger = view.remainingCardCounts.some(
    (count, index) => isOpponent(view, index) && count <= 2,
  );
  const nonBombs = legal.filter((play) => !isBomb(play));
  if (!nonBombs.length && !opponentDanger && view.hand.length > 6) return { kind: "pass" };
  const candidates = nonBombs.length > 0 ? nonBombs : legal;
  const memo = new Map<string, number>();
  const ranked = candidates
    .map((play) => ({ play, score: responseScore(play, view, memo) + random() * 0.08 }))
    .sort((left, right) => right.score - left.score);
  return { kind: "play", cards: ranked[0].play.cards };
}

export function choosePlay(view: AiView, random = Math.random): AiDecision {
  const fallback = chooseHeuristicPlay(view, random);
  if (fallback.cards?.length === view.hand.length) return fallback;
  return chooseEndgame(view, fallback) ?? fallback;
}

export function chooseHint(view: AiView): Card[] {
  const legal = generateLegalPlays(view.hand, view.lastPlay?.pattern ?? null);
  if (legal.length === 0) return [];

  const finishing = legal
    .filter((play) => play.cards.length === view.hand.length)
    .sort((left, right) => openingCost(left) - openingCost(right))[0];
  if (finishing) return finishing.cards;

  if (view.lastPlay === null) return plannedLead(view.hand)?.cards ?? legal[0].cards;

  const nonBombs = legal.filter((play) => !isBomb(play));
  const candidates = nonBombs.length > 0 ? nonBombs : legal;
  const memo = new Map<string, number>();
  return candidates
    .map((play) => ({ play, score: responseScore(play, view, memo) }))
    .sort((left, right) => right.score - left.score)[0].play.cards;
}
