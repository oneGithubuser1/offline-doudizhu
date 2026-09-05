import { describe, expect, it } from "vitest";
import { announcementName } from "../src/audio/voice";
import { classifyPlay } from "../src/core/patterns";
import { cards } from "./helpers";

describe("离线出牌语音", () => {
  it.each([
    ["33", "pair-3"],
    ["33344", "triple-pair"],
    ["333444", "airplane"],
    ["33344456", "airplane-wing"],
    ["7777", "bomb"],
    ["XY", "rocket"],
  ])("%s 选择正确的语音片段 %s", (text, clip) => {
    expect(announcementName(classifyPlay(cards(text))!)).toBe(clip);
  });
});
