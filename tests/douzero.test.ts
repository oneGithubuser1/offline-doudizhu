import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createNeuralAgent, isPrematureRocket } from "../src/ai/neural";
import type { AiView } from "../src/ai/strategy";
import type { Card } from "../src/core/cards";
import { cards } from "./helpers";

interface Fixture { view: AiView; bestAction: Card[] }

const fixtures = JSON.parse(
  await readFile(resolve("tests/fixtures/douzero-parity.json"), "utf8"),
) as Fixture[];
const agent = createNeuralAgent(seat => readFile(resolve(`public/models/${seat}.onnx`)));
afterAll(() => agent.dispose());

describe("DouZero 离线模型", () => {
  it("在官方编码校验过的三种座位状态中选择同一合法动作", async () => {
    const representatives = ["landlord", "landlord_down", "landlord_up"].map(seat =>
      fixtures.find(fixture => {
        const landlord = fixture.view.landlordIndex!;
        const index = fixture.view.ownIndex;
        return seat === "landlord" ? index === landlord
          : seat === "landlord_down" ? index === (landlord + 1) % 3
          : index === (landlord + 2) % 3;
      })!,
    );
    for (const fixture of representatives) {
      const decision = await agent.choose(fixture.view);
      expect((decision.cards ?? []).map(card => card.rank).sort((a, b) => a - b))
        .toEqual(fixture.bestAction.map(card => card.rank).sort((a, b) => a - b));
    }
  }, 15_000);

  it("地主报双时由硬防守接管，不让模型领对子送走地主", async () => {
    let modelLoads = 0;
    const guardedAgent = createNeuralAgent(async () => {
      modelLoads++;
      throw new Error("报双防守不应进入模型");
    });
    const hand = cards("3345");
    const view: AiView = {
      ownIndex: 0,
      ownRole: "farmer",
      hand,
      highestBid: 1,
      landlordIndex: 1,
      lastPlay: null,
      lastPlayBy: null,
      remainingCardCounts: [hand.length, 2, 8],
      playedCards: [],
    };

    const decision = await guardedAgent.choose(view);
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(5);
    expect(modelLoads).toBe(0);
    await guardedAgent.dispose();
  });

  it("地主只剩一张且刚出牌时，有牌能压的农民必须抢回牌权", async () => {
    let modelLoads = 0;
    const guardedAgent = createNeuralAgent(async () => {
      modelLoads++;
      throw new Error("残局硬防守不应进入模型");
    });
    const hand = cards("345A2");
    const landlordPlay = cards("K");
    const view: AiView = {
      ownIndex: 1,
      ownRole: "farmer",
      hand,
      highestBid: 1,
      landlordIndex: 0,
      lastPlay: { cards: landlordPlay, pattern: { type: "single", mainRank: 13, cardCount: 1, sequenceLength: 1 } },
      lastPlayBy: 0,
      remainingCardCounts: [1, hand.length, 6],
      playedCards: landlordPlay,
    };

    const decision = await guardedAgent.choose(view);
    expect(decision.kind).toBe("play");
    expect(decision.cards).toHaveLength(1);
    expect(decision.cards?.[0].rank).toBe(15);
    expect(modelLoads).toBe(0);
    await guardedAgent.dispose();
  });

  it("地主上家会在最后一道关口压住地主的小牌，不会整局机械放行", async () => {
    let modelLoads = 0;
    const guardedAgent = createNeuralAgent(async () => {
      modelLoads++;
      throw new Error("守门定式不应进入模型");
    });
    const hand = cards("456TQA2");
    const landlordPlay = cards("3");
    const view: AiView = {
      ownIndex: 0,
      ownRole: "farmer",
      hand,
      highestBid: 1,
      landlordIndex: 1,
      lastPlay: { cards: landlordPlay, pattern: { type: "single", mainRank: 3, cardCount: 1, sequenceLength: 1 } },
      lastPlayBy: 1,
      remainingCardCounts: [hand.length, 8, 9],
      playedCards: landlordPlay,
    };

    const decision = await guardedAgent.choose(view);
    expect(decision.kind).toBe("play");
    expect(decision.cards?.[0].rank).toBe(14);
    expect(modelLoads).toBe(0);
    await guardedAgent.dispose();
  });

  it("前中盘不能无收益甩王炸，残局或王炸后能一手走完时可以", () => {
    const hand = cards("XY3344556677889");
    const view: AiView = {
      ownIndex: 0,
      ownRole: "farmer",
      hand,
      highestBid: 1,
      landlordIndex: 1,
      lastPlay: null,
      lastPlayBy: null,
      remainingCardCounts: [hand.length, 13, 12],
      playedCards: [],
    };
    expect(isPrematureRocket(view, hand.slice(0, 2))).toBe(true);

    view.remainingCardCounts[1] = 4;
    expect(isPrematureRocket(view, hand.slice(0, 2))).toBe(false);

    const twoHandFinish = cards("XY3456789TJ");
    view.hand = twoHandFinish;
    view.remainingCardCounts = [twoHandFinish.length, 13, 12];
    expect(isPrematureRocket(view, twoHandFinish.slice(0, 2))).toBe(false);
  });
});
