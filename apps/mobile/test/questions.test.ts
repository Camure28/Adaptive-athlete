/** The answer options must carry the values the adaptation rules read (D-026). */
import { describe, expect, it } from "vitest";
import { PAIN_AREA_MAP, PAIN_IMPROVED_ANSWERS } from "@adaptive-athlete/engine";
import { answerOptions } from "../src/logging/questions";

const values = (id: string) => {
  const o = answerOptions(id);
  return o.kind === "choices" ? o.options.map((x) => x.value) : [];
};

describe("answer options", () => {
  it("offer the replies the rules act on", () => {
    expect(values("A-2")).toEqual(expect.arrayContaining(["yes", "no"]));
    expect(values("A-3")).toContain("resume");
    expect(values("F-2.confirm")).toContain("yes");
  });

  it("include the pain-improved replies the engine turns into check-ins", () => {
    for (const [id, improved] of Object.entries(PAIN_IMPROVED_ANSWERS)) {
      expect(values(id)).toEqual(expect.arrayContaining([...improved]));
    }
  });

  it("offer exactly the pain-map groups for 'where is the pain?'", () => {
    expect(values("S-1.area").sort()).toEqual(Object.keys(PAIN_AREA_MAP).sort());
  });

  it("ask for an effort score for Q-1", () => {
    expect(answerOptions("Q-1.0b6f-log").kind).toBe("rpe");
  });
});
