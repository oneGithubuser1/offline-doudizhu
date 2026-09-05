import { describe, expect, it } from "vitest";
import { chooseBid, choosePlay, createAiView } from "../src/ai/strategy";
import {
  createNewSave,
  passTurn,
  placeBid,
  playCards,
  startNextRound,
} from "../src/core/game";
import { seededRandom } from "./helpers";

describe("AI完整对局", () => {
  it("能够连续打完多局且积分守恒", () => {
    const random = seededRandom(20260905);
    let data = createNewSave(random);
    let finishedGames = 0;
    let actions = 0;

    while (finishedGames < 8 && actions < 6000) {
      const index = data.round.currentPlayerIndex;
      if (data.round.phase === "bidding") {
        let bid = chooseBid(data.round.players[index].hand, data.round.highestBid, random);
        if (data.round.bidHistory.length === 2 && data.round.highestBid === 0) bid = 1;
        data = placeBid(data, index, bid, random);
      } else if (data.round.phase === "playing") {
        const before = data;
        const decision = choosePlay(createAiView(data.round, index), random);
        data = decision.kind === "play" && decision.cards
          ? playCards(data, index, decision.cards)
          : passTurn(data, index);
        expect(data).not.toBe(before);
      } else {
        expect(data.round.scoreDeltas.reduce((sum, score) => sum + score, 0)).toBe(0);
        finishedGames += 1;
        data = startNextRound(data, random);
      }
      actions += 1;
    }

    expect(finishedGames).toBe(8);
    expect(actions).toBeLessThan(6000);
    expect(data.profiles.reduce((sum, profile) => sum + profile.score, 0)).toBe(0);
  }, 30_000);
});
