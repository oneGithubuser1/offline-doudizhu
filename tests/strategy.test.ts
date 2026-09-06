import { describe, expect, it } from "vitest";
import { chooseHint, choosePlay, type AiView } from "../src/ai/strategy";
import { classifyPlay } from "../src/core/patterns";
import { cards } from "./helpers";

function view(handText: string, previousText?: string): AiView {
  const hand = cards(handText);
  const previousCards = previousText ? cards(previousText) : null;
  return {
    ownIndex: 0,
    ownRole: "landlord",
    hand,
    highestBid: 1,
    landlordIndex: 0,
    lastPlay: previousCards
      ? { cards: previousCards, pattern: classifyPlay(previousCards)! }
      : null,
    lastPlayBy: previousCards ? 1 : null,
    remainingCardCounts: [hand.length, 10, 10],
    playedCards: [],
  };
}

describe("规则AI策略", () => {
  it("领牌优先先走低位成套牌，而不是从大牌往下扔", () => {
    const decision = choosePlay(view("34567A2"), () => 0.5);
    expect(classifyPlay(decision.cards ?? [])?.type).toBe("straight");
    expect((decision.cards ?? []).map((card) => card.rank).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
  });

  it("跟单张时优先用代价较小的牌", () => {
    const decision = choosePlay(view("4567A2", "3"), () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(4);
  });

  it("有普通牌能压时保留炸弹", () => {
    const decision = choosePlay(view("33332", "A"), () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(15);
  });

  it("农民通常不压队友", () => {
    const teammateView = view("4567A2", "3");
    teammateView.ownRole = "farmer";
    teammateView.landlordIndex = 1;
    teammateView.lastPlayBy = 2;
    const decision = choosePlay(teammateView, () => 0.5);
    expect(decision.kind).toBe("pass");
  });

  it("地主上家会用手中足够大的牌守住队友的小单", () => {
    const gateView = view("456TQA2", "3");
    gateView.ownRole = "farmer";
    gateView.landlordIndex = 2;
    gateView.lastPlayBy = 1;
    gateView.remainingCardCounts = [7, 9, 8];
    const decision = choosePlay(gateView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(14);
  });

  it("地主上家没有大牌时也会用最大可用牌守门，而不是机械放行", () => {
    const gateView = view("4567", "3");
    gateView.ownRole = "farmer";
    gateView.landlordIndex = 2;
    gateView.lastPlayBy = 1;
    gateView.remainingCardCounts = [4, 9, 8];
    const decision = choosePlay(gateView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(7);
  });

  it("地主上家只有一张4时不会做无效守门", () => {
    const gateView = view("4", "3");
    gateView.ownRole = "farmer";
    gateView.landlordIndex = 2;
    gateView.lastPlayBy = 2;
    gateView.remainingCardCounts = [1, 9, 12];
    const decision = choosePlay(gateView, () => 0.5);
    expect(decision.kind).toBe("play");
  });

  it("地主下家接地主小单时先走小牌，留给上家继续守门", () => {
    const downView = view("4567", "3");
    downView.ownRole = "farmer";
    downView.landlordIndex = 1;
    downView.lastPlayBy = 1;
    downView.remainingCardCounts = [4, 12, 9];
    const decision = choosePlay(downView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(4);
  });

  it("地主上家直接面对地主小单时也会守门，不会只加一档", () => {
    const upView = view("4569", "3");
    upView.ownRole = "farmer";
    upView.landlordIndex = 2;
    upView.lastPlayBy = 2;
    upView.remainingCardCounts = [4, 8, 10];
    const decision = choosePlay(upView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(9);
  });

  it("提示不会因为队友领牌而假装无牌可出", () => {
    const teammateView = view("4567A2", "3");
    teammateView.ownRole = "farmer";
    teammateView.landlordIndex = 1;
    teammateView.lastPlayBy = 2;
    const hint = chooseHint(teammateView);
    expect(hint).toHaveLength(1);
    expect(hint[0].rank).toBe(4);
  });

  it("对手剩一张时不主动送小单，优先出对方接不了的多张牌", () => {
    const dangerView = view("3345");
    dangerView.remainingCardCounts = [4, 1, 8];
    const decision = choosePlay(dangerView, () => 0.5);
    expect(classifyPlay(decision.cards ?? [])?.type).toBe("pair");
  });

  it("对手剩一张且自己只能出单时先顶最大单张", () => {
    const dangerView = view("345");
    dangerView.remainingCardCounts = [3, 1, 8];
    const decision = choosePlay(dangerView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(5);
  });

  it("对手剩两张时避免主动出对子让其一手走完", () => {
    const dangerView = view("3345");
    dangerView.remainingCardCounts = [4, 2, 8];
    const decision = choosePlay(dangerView, () => 0.5);
    expect(classifyPlay(decision.cards ?? [])?.type).toBe("single");
    expect(decision.cards?.[0].rank).toBe(5);
  });

  it("地主只剩一张且就在下家时，农民用尽量大的单张守门", () => {
    const guardView = view("4567A2", "3");
    guardView.ownRole = "farmer";
    guardView.landlordIndex = 2;
    guardView.lastPlayBy = 1;
    guardView.remainingCardCounts = [6, 5, 1];
    const decision = choosePlay(guardView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(15);
  });

  it("地主只剩两张且就在下家时，农民会压住队友的小对子", () => {
    const guardView = view("334455", "33");
    guardView.ownRole = "farmer";
    guardView.landlordIndex = 2;
    guardView.lastPlayBy = 1;
    guardView.remainingCardCounts = [6, 5, 2];
    const decision = choosePlay(guardView, () => 0.5);
    expect(classifyPlay(decision.cards ?? [])?.type).toBe("pair");
    expect(classifyPlay(decision.cards ?? [])?.mainRank).toBe(5);
  });

  it("队友只剩一张且就在下家时主动喂最小散牌", () => {
    const supportView = view("3345");
    supportView.ownRole = "farmer";
    supportView.landlordIndex = 1;
    supportView.remainingCardCounts = [4, 7, 1];
    const decision = choosePlay(supportView, () => 0.5);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(4);
  });
});
