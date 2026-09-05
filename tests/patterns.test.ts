import { describe, expect, it } from "vitest";
import { canBeat, classifyPlay } from "../src/core/patterns";
import { generateLegalPlays } from "../src/core/plays";
import { cards } from "./helpers";

describe("牌型识别", () => {
  it.each([
    ["3", "single"],
    ["33", "pair"],
    ["333", "triple"],
    ["3334", "triple_single"],
    ["33344", "triple_pair"],
    ["34567", "straight"],
    ["TJQKA", "straight"],
    ["334455", "pair_straight"],
    ["333444", "triple_straight"],
    ["33344456", "airplane_single"],
    ["3334445566", "airplane_pair"],
    ["555534", "four_two_single"],
    ["55553344", "four_two_pair"],
    ["7777", "bomb"],
    ["XY", "rocket"],
  ])("%s 应识别为 %s", (text, type) => {
    expect(classifyPlay(cards(text))?.type).toBe(type);
  });

  it.each(["A2345", "23456", "JQKA2", "3456", "223344", "QQKKAA22"])(
    "%s 不是合法顺子体系",
    (text) => {
      expect(classifyPlay(cards(text))).toBeNull();
    },
  );

  it("飞机主体不能包含2", () => {
    expect(classifyPlay(cards("KKKAAA222"))).toBeNull();
  });
});

describe("牌型比较", () => {
  it("相同牌型比较主体点数", () => {
    expect(canBeat(classifyPlay(cards("4445"))!, classifyPlay(cards("333Y"))!)).toBe(true);
    expect(canBeat(classifyPlay(cards("333Y"))!, classifyPlay(cards("4445"))!)).toBe(false);
  });

  it("顺子必须张数相同", () => {
    expect(canBeat(classifyPlay(cards("45678"))!, classifyPlay(cards("345678"))!)).toBe(false);
  });

  it("炸弹压普通牌，王炸压炸弹", () => {
    expect(canBeat(classifyPlay(cards("3333"))!, classifyPlay(cards("TJQKA"))!)).toBe(true);
    expect(canBeat(classifyPlay(cards("XY"))!, classifyPlay(cards("2222"))!)).toBe(true);
    expect(canBeat(classifyPlay(cards("2222"))!, classifyPlay(cards("XY"))!)).toBe(false);
  });

  it("四带二不作为炸弹", () => {
    expect(canBeat(classifyPlay(cards("555534"))!, classifyPlay(cards("4444"))!)).toBe(false);
  });
});

describe("合法出牌生成", () => {
  it("可以从手牌生成三带、飞机、四带二", () => {
    const plays = generateLegalPlays(cards("33344455667777XY"));
    const types = new Set(plays.map((play) => play.pattern.type));
    expect(types).toContain("triple_single");
    expect(types).toContain("triple_pair");
    expect(types).toContain("triple_straight");
    expect(types).toContain("airplane_single");
    expect(types).toContain("airplane_pair");
    expect(types).toContain("four_two_single");
    expect(types).toContain("four_two_pair");
    expect(types).toContain("rocket");
  });

  it("跟牌时只返回能压过的候选", () => {
    const previous = classifyPlay(cards("8889"))!;
    const plays = generateLegalPlays(cards("333999TJQKAX"), previous);
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((play) => canBeat(play.pattern, previous))).toBe(true);
  });
});
