import { describe, it, expect } from "vitest";
import { getRunVerdict } from "@/config/run-verdict";

describe("getRunVerdict", () => {
  it("rewards a fast kamikaze drain with a higher grade", () => {
    // Pars: medium par 5000ms. A 2500ms drain → ratio 2.0 → S.
    // A 12000ms drain → ratio 0.42 → D.
    const fast = getRunVerdict(true, 2500, "medium");
    const slow = getRunVerdict(true, 12000, "medium");
    expect(fast.ratio).toBeGreaterThan(slow.ratio);
    expect(["A", "S"]).toContain(fast.grade);
    expect(["C", "D"]).toContain(slow.grade);
  });

  it("rewards a high classic score with a higher grade", () => {
    const high = getRunVerdict(false, 80000, "medium");
    const low = getRunVerdict(false, 5000, "medium");
    expect(["S", "A"]).toContain(high.grade);
    expect(low.ratio).toBeLessThan(high.ratio);
  });

  it("is deterministic for identical inputs", () => {
    const a = getRunVerdict(true, 18000, "hard");
    const b = getRunVerdict(true, 18000, "hard");
    expect(a).toEqual(b);
  });

  it("never returns an undefined grade and always includes a kanji + line", () => {
    for (const score of [1, 100, 999999]) {
      const v = getRunVerdict(true, score, "easy");
      expect(v.grade).toBeDefined();
      expect(v.kanji.length).toBeGreaterThan(0);
      expect(v.line.length).toBeGreaterThan(0);
    }
  });
});
