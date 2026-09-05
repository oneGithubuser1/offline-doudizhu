import { describe, expect, it } from "vitest";
import {
  createNewSave,
  passTurn,
  placeBid,
  playCards,
  remainingRankCounts,
} from "../src/core/game";
import { cards, seededRandom } from "./helpers";

describe("发牌与叫分", () => {
  it("每人17张并保留3张底牌", () => {
    const data = createNewSave(seededRandom());
    expect(data.round.players.map((player) => player.hand.length)).toEqual([17, 17, 17]);
    expect(data.round.bottomCards).toHaveLength(3);
    const ids = new Set([
      ...data.round.players.flatMap((player) => player.hand),
      ...data.round.bottomCards,
    ].map((card) => card.id));
    expect(ids.size).toBe(54);
  });

  it("叫3分立即成为地主并取得底牌", () => {
    const data = createNewSave(seededRandom(8));
    const bidder = data.round.currentPlayerIndex;
    const next = placeBid(data, bidder, 3);
    expect(next.round.phase).toBe("playing");
    expect(next.round.landlordIndex).toBe(bidder);
    expect(next.round.players[bidder].hand).toHaveLength(20);
    expect(next.round.multiplier).toBe(3);
  });

  it("三家不叫后重新发牌", () => {
    let data = createNewSave(seededRandom(9));
    const originalIds = data.round.players[0].hand.map((card) => card.id).join(",");
    const random = seededRandom(10);
    for (let turn = 0; turn < 3; turn += 1) {
      data = placeBid(data, data.round.currentPlayerIndex, 0, random);
    }
    expect(data.round.phase).toBe("bidding");
    expect(data.round.bidHistory).toHaveLength(0);
    expect(data.round.players[0].hand.map((card) => card.id).join(",")).not.toBe(originalIds);
  });
});

describe("出牌与结算", () => {
  it("炸弹和春天都翻倍，三方积分保持零和", () => {
    const data = createNewSave(seededRandom());
    data.round.phase = "playing";
    data.round.landlordIndex = 0;
    data.round.currentPlayerIndex = 0;
    data.round.highestBid = 2;
    data.round.multiplier = 2;
    data.round.players[0].role = "landlord";
    data.round.players[1].role = "farmer";
    data.round.players[2].role = "farmer";
    data.round.players[0].hand = cards("3333");
    data.round.players[1].hand = cards("4");
    data.round.players[2].hand = cards("5");

    const result = playCards(data, 0, data.round.players[0].hand);
    expect(result.round.phase).toBe("finished");
    expect(result.round.spring).toBe("spring");
    expect(result.round.multiplier).toBe(8);
    expect(result.round.scoreDeltas).toEqual([16, -8, -8]);
    expect(result.profiles.reduce((sum, profile) => sum + profile.score, 0)).toBe(0);
  });

  it("两家不出后由原出牌者重新领牌", () => {
    const data = createNewSave(seededRandom());
    data.round.phase = "playing";
    data.round.landlordIndex = 0;
    data.round.currentPlayerIndex = 0;
    data.round.players[0].role = "landlord";
    data.round.players[1].role = "farmer";
    data.round.players[2].role = "farmer";
    data.round.players[0].hand = cards("34");
    data.round.players[1].hand = cards("5");
    data.round.players[2].hand = cards("6");

    let next = playCards(data, 0, [data.round.players[0].hand[0]]);
    next = passTurn(next, 1);
    next = passTurn(next, 2);
    expect(next.round.currentPlayerIndex).toBe(0);
    expect(next.round.lastPlay).toBeNull();
  });

  it("同一玩家连续两轮不出也会获得新的动作序号", () => {
    const data = createNewSave(seededRandom());
    data.round.phase = "playing";
    data.round.landlordIndex = 0;
    data.round.currentPlayerIndex = 0;
    data.round.players[0].role = "landlord";
    data.round.players[1].role = "farmer";
    data.round.players[2].role = "farmer";
    data.round.players[0].hand = cards("345");
    data.round.players[1].hand = cards("67");
    data.round.players[2].hand = cards("89");

    let next = playCards(data, 0, [data.round.players[0].hand[0]]);
    next = passTurn(next, 1);
    const firstPassSerial = next.round.lastActions[1]?.serial;
    next = passTurn(next, 2);
    next = playCards(next, 0, [next.round.players[0].hand[0]]);
    next = passTurn(next, 1);
    expect(next.round.lastActions[1]?.text).toBe("不出");
    expect(next.round.lastActions[1]?.serial).toBeGreaterThan(firstPassSerial ?? 0);
  });

  it("记牌器只扣除自己的牌和已经打出的牌", () => {
    const data = createNewSave(seededRandom());
    const counts = remainingRankCounts(data.round);
    const unseen = [...counts.values()].reduce((sum, value) => sum + value, 0);
    expect(unseen).toBe(37);
  });
});
