import { createDeck, removeCardsFromHand, type Card } from "../core/cards";
import { canBeat, type PlayPattern } from "../core/patterns";
import { generateLegalPlays, type LegalPlay } from "../core/plays";
import type { AiDecision, AiView } from "./strategy";

interface Position {
  hands: Card[][];
  turn: number;
  landlord: number;
  target: PlayPattern | null;
  owner: number | null;
  passes: number;
}

function handKey(cards: Card[]): string {
  const counts = Array<number>(15).fill(0);
  for (const card of cards) counts[card.rank - 3]++;
  return counts.join("");
}

function patternKey(pattern: PlayPattern | null): string {
  return pattern ? `${pattern.type}:${pattern.mainRank}:${pattern.cardCount}` : "lead";
}

function after(position: Position, play: LegalPlay | null): Position {
  if (!play) {
    const clear = position.passes === 1;
    return { ...position, turn: (position.turn + 1) % 3,
      target: clear ? null : position.target, owner: clear ? null : position.owner,
      passes: clear ? 0 : position.passes + 1 };
  }
  const hands = position.hands.slice();
  hands[position.turn] = removeCardsFromHand(hands[position.turn], play.cards);
  return { ...position, hands, turn: (position.turn + 1) % 3,
    target: play.pattern, owner: position.turn, passes: 0 };
}

const BUDGET_EXHAUSTED = Symbol("endgame budget");

// Exact team minimax for a *sampled* deal. A cache entry is written only after
// proving its winner; a budget interruption never masquerades as a loss.
function solver(nodeLimit: number) {
  const outcomes = new Map<string, boolean>();
  const moves = new Map<string, LegalPlay[]>();
  let nodes = 0;
  function solve(position: Position): boolean {
    if (++nodes > nodeLimit) throw BUDGET_EXHAUSTED;
    const winner = position.hands.findIndex(hand => hand.length === 0);
    if (winner >= 0) return winner === position.landlord;
    const keys = position.hands.map(handKey);
    const key = `${keys.join("/")}/${position.turn}/${patternKey(position.target)}/${position.owner}/${position.passes}`;
    const cached = outcomes.get(key);
    if (cached !== undefined) return cached;
    const hand = position.hands[position.turn];
    // Cache uses card IDs as well as rank counts because different samples may
    // allocate equal ranks differently. The exact outcome cache is rank-only.
    const moveKey = hand.map(card => card.id).sort().join(",");
    let all = moves.get(moveKey);
    if (!all) {
      all = generateLegalPlays(hand).sort((a, b) => b.cards.length - a.cards.length || b.pattern.mainRank - a.pattern.mainRank);
      moves.set(moveKey, all);
    }
    const legal = all.filter(play => canBeat(play.pattern, position.target));
    const desired = position.turn === position.landlord;
    if (legal.some(play => play.cards.length === hand.length)) {
      outcomes.set(key, desired);
      return desired;
    }
    const options: Array<LegalPlay | null> = [...legal];
    if (position.target) {
      if (!desired && position.owner !== position.landlord) options.unshift(null);
      else options.push(null);
    }
    for (const play of options) {
      if (solve(after(position, play)) === desired) {
        outcomes.set(key, desired);
        return desired;
      }
    }
    outcomes.set(key, !desired);
    return !desired;
  }
  return solve;
}

export function unseenCards(view: AiView): Card[] | null {
  const known = [...view.hand, ...view.playedCards];
  const ids = new Set(known.map(card => card.id));
  const deck = createDeck();
  const deckById = new Map(deck.map(card => [card.id, card]));
  if (ids.size !== known.length || known.some(card => deckById.get(card.id)?.rank !== card.rank)) return null;
  const unseen = deck.filter(card => !ids.has(card.id));
  const otherCount = view.remainingCardCounts.reduce((sum, count, index) => sum + (index === view.ownIndex ? 0 : count), 0);
  return unseen.length === otherCount ? unseen : null;
}

// The actual opponents' hands are never accepted by this API. Only our hand,
// played cards, public bottom cards, seat roles and remaining counts are used.
export function chooseEndgame(view: AiView, fallback: AiDecision): AiDecision | null {
  const total = view.remainingCardCounts.reduce((a, b) => a + b, 0);
  if (total > 15 || view.landlordIndex === null) return null;
  const pool = unseenCards(view);
  if (!pool) return null;
  const legal = generateLegalPlays(view.hand, view.lastPlay?.pattern ?? null);
  const choices: Array<LegalPlay | null> = [...legal];
  if (view.lastPlay) choices.push(null);
  if (choices.length <= 1) return null;

  const played = new Set(view.playedCards.map(card => card.id));
  const fixed = view.landlordIndex === view.ownIndex ? [] : (view.publicBottomCards ?? []).filter(card => !played.has(card.id));
  const fixedIds = new Set(fixed.map(card => card.id));
  if (fixed.length > view.remainingCardCounts[view.landlordIndex] || fixed.some(card => !pool.some(item => item.id === card.id))) return null;
  const unknown = pool.filter(card => !fixedIds.has(card.id));
  const others = [0, 1, 2].filter(index => index !== view.ownIndex);
  const firstCount = view.remainingCardCounts[others[0]] - (others[0] === view.landlordIndex ? fixed.length : 0);
  const wins = Array<number>(choices.length).fill(0);
  let completed = 0;
  let seed = [...view.hand, ...view.playedCards].reduce((acc, card) => (acc * 31 + card.rank) >>> 0, 719);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Equal scenario weights: every candidate is solved against the same deals.
  // No selecting a move based on a partial or easier subset of its outcomes.
  const scenarios = new Set<string>();
  const maximum = total <= 10 ? 24 : 10;
  for (let attempt = 0; attempt < maximum * 4 && scenarios.size < maximum; attempt++) {
    const shuffled = unknown.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const hands: Card[][] = [[], [], []];
    hands[view.ownIndex] = view.hand;
    hands[others[0]] = shuffled.slice(0, firstCount);
    hands[others[1]] = shuffled.slice(firstCount);
    hands[view.landlordIndex] = [...hands[view.landlordIndex], ...fixed];
    const scenario = hands.map(handKey).join("/");
    if (scenarios.has(scenario)) continue;
    scenarios.add(scenario);
    const position: Position = { hands, turn: view.ownIndex, landlord: view.landlordIndex,
      target: view.lastPlay?.pattern ?? null, owner: view.lastPlayBy, passes: view.passCount ?? 0 };
    const solve = solver(total <= 10 ? 7000 : 11000);
    try {
      const results = choices.map(play => solve(after(position, play)) === (view.ownIndex === view.landlordIndex));
      results.forEach((win, i) => { if (win) wins[i]++; });
      completed++;
    } catch (error) {
      if (error !== BUDGET_EXHAUSTED) throw error;
    }
  }
  if (completed === 0 || (completed < 3 && scenarios.size > completed)) return null;
  const fallbackKey = fallback.kind === "pass" ? "pass" : handKey(fallback.cards ?? []);
  const ranked = choices.map((play, index) => ({ play, wins: wins[index],
    preferred: (play ? handKey(play.cards) : "pass") === fallbackKey ? 1 : 0 }))
    .sort((a, b) => b.wins - a.wins || b.preferred - a.preferred);
  return ranked[0].play ? { kind: "play", cards: ranked[0].play.cards } : { kind: "pass" };
}
