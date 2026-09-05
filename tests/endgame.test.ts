import { describe, expect, it } from "vitest";
import { createDeck, type Card } from "../src/core/cards";
import { choosePlay, createAiView, type AiView } from "../src/ai/strategy";
import { chooseEndgame } from "../src/ai/endgame";
import { createNewSave } from "../src/core/game";
import { canBeat, classifyPlay } from "../src/core/patterns";
import { cards } from "./helpers";

function position(hands: string[], landlord = 0, previous?: string, owner = 1, passes = 0): AiView {
  let deck = createDeck();
  const take = (text: string): Card[] => cards(text).map(({ rank }) => {
    const card = deck.find(item => item.rank === rank)!;
    if (!card) throw new Error(`Fixture overdraws rank ${rank}`);
    deck = deck.filter(item => item.id !== card.id);
    return card;
  });
  const allocated = hands.map(take);
  const last = previous ? take(previous) : null;
  return { ownIndex: 0, ownRole: landlord === 0 ? "landlord" : "farmer", hand: allocated[0],
    landlordIndex: landlord, highestBid: 1,
    lastPlay: last ? { cards: last, pattern: classifyPlay(last)! } : null,
    lastPlayBy: last ? owner : null, passCount: passes,
    remainingCardCounts: allocated.map(hand => hand.length),
    playedCards: [...deck, ...(last ?? [])], publicBottomCards: [] };
}

describe("公开信息残局推演", () => {
  it("王炸加一张小牌时先王炸保住出牌权，不能先送小牌", () => {
    const decision = choosePlay(position(["3XY", "4", "5"]));
    expect(classifyPlay(decision.cards ?? [])?.type).toBe("rocket");
  });

  it("两张散牌先用大牌拿回出牌权再出小牌", () => {
    const decision = chooseEndgame(position(["5A", "6", "7"]), { kind: "play", cards: [] });
    expect(decision?.cards?.[0].rank).toBe(14);
  });

  it("地主已经不出时让队友继续领牌，不能无谓抢队友出牌权", () => {
    const view = position(["6Q", "4", "A"], 2, "3", 1, 1);
    view.publicBottomCards = createDeck().filter(card => card.rank === 14).slice(0, 1);
    const decision = choosePlay(view);
    expect(decision.kind).toBe("pass");
  });

  it("地主报单时即使要拆炸弹也会顶住，而不是被守门规则直接不出", () => {
    const view = position(["AAAA3", "K", "45678"], 1, "Q", 2);
    const decision = choosePlay(view);
    expect(decision.kind).toBe("play");
    expect(canBeat(classifyPlay(decision.cards!)!, view.lastPlay!.pattern)).toBe(true);
  });

  it("传入的信息不包含其他玩家手牌；互换暗牌不改变决策", () => {
    const save = createNewSave(() => .42);
    const first = createAiView(save.round, 0);
    [save.round.players[1].hand, save.round.players[2].hand] = [save.round.players[2].hand, save.round.players[1].hand];
    expect(createAiView(save.round, 0)).toEqual(first);
    expect(first).not.toHaveProperty("players");
  });

  it("对子跟牌推演的所有选择仍遵守原牌型与大小规则", () => {
    const view = position(["4455X", "667", "889"], 0, "33", 1);
    const decision = choosePlay(view);
    if (decision.kind === "play") {
      expect(canBeat(classifyPlay(decision.cards!)!, view.lastPlay!.pattern)).toBe(true);
      expect(decision.cards!.every(card => view.hand.some(own => own.id === card.id))).toBe(true);
    } else expect(view.lastPlay).not.toBeNull();
  });
});
