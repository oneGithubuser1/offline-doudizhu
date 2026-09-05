import {
  type Card,
  createDeck,
  removeCardsFromHand,
  shuffleCards,
  sortCards,
} from "./cards";
import { canBeat, classifyPlay, PLAY_LABEL, type PlayPattern } from "./patterns";

export type PlayerId = "human" | "ai-left" | "ai-right";
export type PlayerRole = "landlord" | "farmer" | null;
export type GamePhase = "bidding" | "playing" | "finished";

export interface PlayerState {
  id: PlayerId;
  name: string;
  isHuman: boolean;
  hand: Card[];
  role: PlayerRole;
  playedHands: number;
}

export interface PlayerProfile {
  id: PlayerId;
  name: string;
  score: number;
  games: number;
  wins: number;
  landlordGames: number;
  landlordWins: number;
  farmerGames: number;
  farmerWins: number;
  bestMultiplier: number;
}

export interface GameSettings {
  cardCounter: boolean;
  sound: boolean;
  voice: boolean;
  musicVolume?: number;
  largeCards: boolean;
  aiDelayMs: number;
}

export interface BidRecord {
  playerIndex: number;
  value: number;
}

export interface TableAction {
  kind: "bid" | "play" | "pass" | "result";
  text: string;
  cards?: Card[];
  serial?: number;
}

export interface ActionRecord {
  serial: number;
  playerIndex: number;
  action: TableAction;
}

export interface ActivePlay {
  cards: Card[];
  pattern: PlayPattern;
}

export interface RoundState {
  roundNumber: number;
  phase: GamePhase;
  players: PlayerState[];
  bottomCards: Card[];
  bottomRevealed: boolean;
  currentPlayerIndex: number;
  firstBidderIndex: number;
  bidHistory: BidRecord[];
  highestBid: number;
  highestBidderIndex: number | null;
  landlordIndex: number | null;
  lastPlay: ActivePlay | null;
  lastPlayBy: number | null;
  passCount: number;
  multiplier: number;
  playedCards: Card[];
  lastActions: Array<TableAction | null>;
  actionSerial?: number;
  actionHistory?: ActionRecord[];
  winnerTeam: "landlord" | "farmers" | null;
  scoreDeltas: number[];
  spring: "spring" | "anti-spring" | null;
}

export interface SaveData {
  version: 1;
  profiles: PlayerProfile[];
  settings: GameSettings;
  round: RoundState;
  savedAt: string;
}

const PLAYER_DEFINITIONS: Array<Pick<PlayerState, "id" | "name" | "isHuman">> = [
  { id: "human", name: "您", isHuman: true },
  { id: "ai-left", name: "小河", isHuman: false },
  { id: "ai-right", name: "老林", isHuman: false },
];

export const DEFAULT_SETTINGS: GameSettings = {
  cardCounter: false,
  sound: true,
  voice: true,
  largeCards: false,
  aiDelayMs: 1600,
};

export function createProfiles(): PlayerProfile[] {
  return PLAYER_DEFINITIONS.map((player) => ({
    id: player.id,
    name: player.name,
    score: 0,
    games: 0,
    wins: 0,
    landlordGames: 0,
    landlordWins: 0,
    farmerGames: 0,
    farmerWins: 0,
    bestMultiplier: 1,
  }));
}

export function createRound(
  random = Math.random,
  roundNumber = 1,
): RoundState {
  const deck = shuffleCards(createDeck(), random);
  const hands: Card[][] = [[], [], []];
  for (let index = 0; index < 51; index += 1) {
    hands[index % 3].push(deck[index]);
  }
  const players = PLAYER_DEFINITIONS.map((definition, index) => ({
    ...definition,
    hand: sortCards(hands[index]),
    role: null,
    playedHands: 0,
  }));
  const firstBidderIndex = Math.floor(random() * 3);

  return {
    roundNumber,
    phase: "bidding",
    players,
    bottomCards: sortCards(deck.slice(51)),
    bottomRevealed: false,
    currentPlayerIndex: firstBidderIndex,
    firstBidderIndex,
    bidHistory: [],
    highestBid: 0,
    highestBidderIndex: null,
    landlordIndex: null,
    lastPlay: null,
    lastPlayBy: null,
    passCount: 0,
    multiplier: 1,
    playedCards: [],
    lastActions: [null, null, null],
    actionSerial: 0,
    actionHistory: [],
    winnerTeam: null,
    scoreDeltas: [0, 0, 0],
    spring: null,
  };
}

export function createNewSave(random = Math.random): SaveData {
  return {
    version: 1,
    profiles: createProfiles(),
    settings: { ...DEFAULT_SETTINGS },
    round: createRound(random),
    savedAt: new Date().toISOString(),
  };
}

function cloneRound(round: RoundState): RoundState {
  return {
    ...round,
    players: round.players.map((player) => ({ ...player, hand: [...player.hand] })),
    bottomCards: [...round.bottomCards],
    bidHistory: [...round.bidHistory],
    playedCards: [...round.playedCards],
    lastPlay: round.lastPlay
      ? {
          cards: [...round.lastPlay.cards],
          pattern: { ...round.lastPlay.pattern },
        }
      : null,
    lastActions: round.lastActions.map((action) =>
      action ? { ...action, cards: action.cards ? [...action.cards] : undefined } : null,
    ),
    actionHistory: (round.actionHistory ?? []).map((record) => ({
      ...record,
      action: {
        ...record.action,
        cards: record.action.cards ? [...record.action.cards] : undefined,
      },
    })),
    scoreDeltas: [...round.scoreDeltas],
  };
}

function recordAction(
  round: RoundState,
  playerIndex: number,
  action: Omit<TableAction, "serial">,
): void {
  round.actionSerial = (round.actionSerial ?? 0) + 1;
  const recordedAction = { ...action, serial: round.actionSerial };
  round.lastActions[playerIndex] = recordedAction;
  round.actionHistory = [
    ...(round.actionHistory ?? []),
    { serial: round.actionSerial, playerIndex, action: recordedAction },
  ];
}

function beginPlaying(round: RoundState): RoundState {
  if (round.highestBidderIndex === null || round.highestBid === 0) return round;
  const landlordIndex = round.highestBidderIndex;
  const next = cloneRound(round);
  next.phase = "playing";
  next.landlordIndex = landlordIndex;
  next.currentPlayerIndex = landlordIndex;
  next.bottomRevealed = true;
  next.multiplier = next.highestBid;
  next.players = next.players.map((player, index) => ({
    ...player,
    role: index === landlordIndex ? "landlord" : "farmer",
    hand:
      index === landlordIndex
        ? sortCards([...player.hand, ...next.bottomCards])
        : player.hand,
  }));
  recordAction(next, landlordIndex, { kind: "result", text: "成为地主" });
  return next;
}

export function placeBid(
  data: SaveData,
  playerIndex: number,
  value: number,
  random = Math.random,
): SaveData {
  const round = data.round;
  if (round.phase !== "bidding" || playerIndex !== round.currentPlayerIndex) return data;
  if (!Number.isInteger(value) || value < 0 || value > 3) return data;
  if (value !== 0 && value <= round.highestBid) return data;

  const nextRound = cloneRound(round);
  nextRound.bidHistory.push({ playerIndex, value });
  recordAction(nextRound, playerIndex, {
    kind: "bid",
    text: value === 0 ? "不叫" : `${value}分`,
  });
  if (value > nextRound.highestBid) {
    nextRound.highestBid = value;
    nextRound.highestBidderIndex = playerIndex;
  }

  const biddingComplete = value === 3 || nextRound.bidHistory.length === 3;
  if (biddingComplete) {
    if (nextRound.highestBidderIndex === null) {
      return {
        ...data,
        round: createRound(random, round.roundNumber),
        savedAt: new Date().toISOString(),
      };
    }
    return {
      ...data,
      round: beginPlaying(nextRound),
      savedAt: new Date().toISOString(),
    };
  }

  nextRound.currentPlayerIndex = (playerIndex + 1) % 3;
  return { ...data, round: nextRound, savedAt: new Date().toISOString() };
}

function settleProfiles(
  profiles: PlayerProfile[],
  round: RoundState,
): PlayerProfile[] {
  if (round.landlordIndex === null || round.winnerTeam === null) return profiles;
  return profiles.map((profile, index) => {
    const isLandlord = index === round.landlordIndex;
    const won = isLandlord
      ? round.winnerTeam === "landlord"
      : round.winnerTeam === "farmers";
    return {
      ...profile,
      score: profile.score + round.scoreDeltas[index],
      games: profile.games + 1,
      wins: profile.wins + (won ? 1 : 0),
      landlordGames: profile.landlordGames + (isLandlord ? 1 : 0),
      landlordWins: profile.landlordWins + (isLandlord && won ? 1 : 0),
      farmerGames: profile.farmerGames + (isLandlord ? 0 : 1),
      farmerWins: profile.farmerWins + (!isLandlord && won ? 1 : 0),
      bestMultiplier: Math.max(profile.bestMultiplier, round.multiplier),
    };
  });
}

export function playCards(
  data: SaveData,
  playerIndex: number,
  selectedCards: Card[],
): SaveData {
  const round = data.round;
  if (round.phase !== "playing" || playerIndex !== round.currentPlayerIndex) return data;
  const player = round.players[playerIndex];
  const handIds = new Set(player.hand.map((card) => card.id));
  if (selectedCards.length === 0 || selectedCards.some((card) => !handIds.has(card.id))) {
    return data;
  }

  const pattern = classifyPlay(selectedCards);
  if (!pattern || !canBeat(pattern, round.lastPlay?.pattern ?? null)) return data;

  const nextRound = cloneRound(round);
  const nextPlayer = nextRound.players[playerIndex];
  nextPlayer.hand = sortCards(removeCardsFromHand(nextPlayer.hand, selectedCards));
  nextPlayer.playedHands += 1;
  nextRound.playedCards.push(...selectedCards);
  nextRound.lastPlay = { cards: sortCards(selectedCards), pattern };
  nextRound.lastPlayBy = playerIndex;
  nextRound.passCount = 0;
  recordAction(nextRound, playerIndex, {
    kind: "play",
    text: PLAY_LABEL[pattern.type],
    cards: sortCards(selectedCards),
  });

  if (pattern.type === "bomb" || pattern.type === "rocket") {
    nextRound.multiplier *= 2;
  }

  if (nextPlayer.hand.length === 0) {
    const landlordWon = playerIndex === nextRound.landlordIndex;
    nextRound.phase = "finished";
    nextRound.winnerTeam = landlordWon ? "landlord" : "farmers";

    const landlord = nextRound.players[nextRound.landlordIndex ?? 0];
    const farmers = nextRound.players.filter((_, index) => index !== nextRound.landlordIndex);
    if (landlordWon && farmers.every((farmer) => farmer.playedHands === 0)) {
      nextRound.spring = "spring";
      nextRound.multiplier *= 2;
    } else if (!landlordWon && landlord.playedHands === 1) {
      nextRound.spring = "anti-spring";
      nextRound.multiplier *= 2;
    }

    const unit = nextRound.multiplier;
    nextRound.scoreDeltas = nextRound.players.map((_, index) => {
      const isLandlord = index === nextRound.landlordIndex;
      if (landlordWon) return isLandlord ? unit * 2 : -unit;
      return isLandlord ? -unit * 2 : unit;
    });
    recordAction(nextRound, playerIndex, {
      kind: "result",
      text: landlordWon ? "地主获胜" : "农民获胜",
      cards: sortCards(selectedCards),
    });
    const nextProfiles = settleProfiles(data.profiles, nextRound);
    return {
      ...data,
      profiles: nextProfiles,
      round: nextRound,
      savedAt: new Date().toISOString(),
    };
  }

  nextRound.currentPlayerIndex = (playerIndex + 1) % 3;
  return { ...data, round: nextRound, savedAt: new Date().toISOString() };
}

export function passTurn(data: SaveData, playerIndex: number): SaveData {
  const round = data.round;
  if (
    round.phase !== "playing" ||
    playerIndex !== round.currentPlayerIndex ||
    round.lastPlay === null
  ) {
    return data;
  }

  const nextRound = cloneRound(round);
  recordAction(nextRound, playerIndex, { kind: "pass", text: "不出" });
  nextRound.passCount += 1;
  nextRound.currentPlayerIndex = (playerIndex + 1) % 3;

  if (nextRound.passCount >= 2) {
    nextRound.lastPlay = null;
    nextRound.lastPlayBy = null;
    nextRound.passCount = 0;
  }

  return { ...data, round: nextRound, savedAt: new Date().toISOString() };
}

export function startNextRound(data: SaveData, random = Math.random): SaveData {
  if (data.round.phase !== "finished") return data;
  return {
    ...data,
    round: createRound(random, data.round.roundNumber + 1),
    savedAt: new Date().toISOString(),
  };
}

export function updateSettings(data: SaveData, settings: Partial<GameSettings>): SaveData {
  return {
    ...data,
    settings: { ...data.settings, ...settings },
    savedAt: new Date().toISOString(),
  };
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SaveData>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.profiles) &&
    candidate.profiles.length === 3 &&
    Boolean(candidate.settings) &&
    Boolean(candidate.round) &&
    Array.isArray(candidate.round?.players) &&
    candidate.round.players.length === 3
  );
}

export function remainingRankCounts(round: RoundState, humanIndex = 0): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of createDeck()) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  for (const card of round.players[humanIndex].hand) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) - 1);
  }
  for (const card of round.playedCards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) - 1);
  }
  return counts;
}
