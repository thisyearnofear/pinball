import { describe, it, expect } from "vitest";
import {
    emptyMemory, emptyHabits, recordRunResult, greetingLine, dominantHabit, habitTaunt,
    rankTier, isSilentRank, rankAddress, subduedSaveTaunt,
    NEMESIS_DRAIN_MS, HABIT_MIN_NUDGES,
} from "@/utils/machine-memory";

describe("machine memory (B1)", () => {

    describe("emptyMemory()", () => {
        it("should start with no encounters and zeroed habits", () => {
            const mem = emptyMemory();
            expect(mem.encounters).toEqual(0);
            expect(mem.bestPlayerDrainMs).toBeNull();
            expect(mem.lastRunMs).toBeNull();
            expect(mem.habits).toEqual(emptyHabits());
        });
    });

    describe("recordRunResult()", () => {
        it("should bump encounters and record the run time", () => {
            const mem = recordRunResult(emptyMemory(), 4200, emptyHabits());
            expect(mem.encounters).toEqual(1);
            expect(mem.lastRunMs).toEqual(4200);
            expect(mem.bestPlayerDrainMs).toEqual(4200);
        });

        it("should keep the lowest drain as the best", () => {
            let mem = recordRunResult(emptyMemory(), 8000, emptyHabits());
            mem = recordRunResult(mem, 3500, emptyHabits());
            mem = recordRunResult(mem, 5000, emptyHabits());
            expect(mem.bestPlayerDrainMs).toEqual(3500);
            expect(mem.lastRunMs).toEqual(5000);
            expect(mem.encounters).toEqual(3);
        });

        it("should preserve firstSeenDay across later runs", () => {
            const first = recordRunResult(emptyMemory(), 4000, emptyHabits());
            const second = recordRunResult(first, 3000, emptyHabits());
            expect(second.firstSeenDay).toEqual(first.firstSeenDay);
        });

        it("should fold run habits into cumulative habits", () => {
            let mem = recordRunResult(emptyMemory(), 4000, { left: 5, center: 2, right: 1, dives: 1, tiltLocks: 0 });
            mem = recordRunResult(mem, 3000, { left: 3, center: 0, right: 4, dives: 0, tiltLocks: 2 });
            expect(mem.habits.left).toEqual(8);
            expect(mem.habits.center).toEqual(2);
            expect(mem.habits.right).toEqual(5);
            expect(mem.habits.dives).toEqual(1);
            expect(mem.habits.tiltLocks).toEqual(2);
        });

        it("should not lower the best when a run has no drain", () => {
            const mem = recordRunResult(emptyMemory(), null, emptyHabits());
            expect(mem.bestPlayerDrainMs).toBeNull();
            expect(mem.lastRunMs).toBeNull();
        });
    });

    describe("greetingLine()", () => {
        it("should introduce itself on the first meeting", () => {
            expect(greetingLine(emptyMemory())).toContain("守");
        });

        it("should recognize a returning player with their last run", () => {
            const mem = recordRunResult(emptyMemory(), 7500, emptyHabits());
            expect(greetingLine(mem)).toContain("7.5s");
        });

        it("should dread a nemesis whose best drain beats the threshold", () => {
            const mem = recordRunResult(emptyMemory(), NEMESIS_DRAIN_MS - 1000, emptyHabits());
            expect(greetingLine(mem)).toContain("dream");
        });
    });

    describe("dominantHabit()", () => {
        it("should return null before enough nudges to read the player", () => {
            expect(dominantHabit({ left: 9, center: 0, right: 0, dives: 0, tiltLocks: 0 })).toBeNull();
        });

        it("should return null when no bucket dominates", () => {
            const even = Math.ceil(HABIT_MIN_NUDGES / 3);
            expect(dominantHabit({ left: even, center: even, right: even, dives: 0, tiltLocks: 0 })).toBeNull();
        });

        it("should name a direction that clears the dominance share", () => {
            expect(dominantHabit({ left: 12, center: 2, right: 1, dives: 0, tiltLocks: 0 })).toEqual("left");
            expect(dominantHabit({ left: 1, center: 2, right: 14, dives: 0, tiltLocks: 0 })).toEqual("right");
        });
    });

    describe("habitTaunt()", () => {
        it("should give each readable habit a distinct call-out", () => {
            const lines = new Set(["left", "center", "right"].map((l) => habitTaunt(l as any)));
            expect(lines.size).toEqual(3);
        });
    });

    describe("rank tiers (B2)", () => {
        it("should map ranks to their perception tier", () => {
            expect(rankTier("Breeze")).toEqual("dismissive");
            expect(rankTier("Tailwind")).toEqual("dismissive");
            expect(rankTier("Gale")).toEqual("wary");
            expect(rankTier("Storm")).toEqual("wary");
            expect(rankTier("Tempest")).toEqual("respect");
            expect(rankTier("Kamikaze")).toEqual("silence");
        });

        it("should default an unknown rank to dismissive", () => {
            expect(rankTier(undefined)).toEqual("dismissive");
            expect(rankTier("???")).toEqual("dismissive");
        });

        it("should treat only the max rank as silent", () => {
            expect(isSilentRank("Kamikaze")).toBe(true);
            expect(isSilentRank("Tempest")).toBe(false);
            expect(isSilentRank(undefined)).toBe(false);
        });

        it("should give each tier a distinct address", () => {
            expect(rankAddress("Breeze")).toContain("breeze");
            expect(rankAddress("Gale")).toContain("Storm-class");
            expect(rankAddress("Tempest")).toContain("replays");
            expect(rankAddress("Kamikaze")).toEqual("…");
        });

        it("should offer a subdued save line", () => {
            expect(subduedSaveTaunt().length).toBeGreaterThan(0);
        });
    });

    describe("greetingLine() rank awareness (B2)", () => {
        it("should greet a max-rank player with silence", () => {
            const mem = recordRunResult(emptyMemory(), 4000, emptyHabits());
            expect(greetingLine(mem, "Kamikaze")).toEqual("…");
        });

        it("should address a returning low-rank player dismissively", () => {
            const mem = recordRunResult(emptyMemory(), 12000, emptyHabits());
            const line = greetingLine(mem, "Breeze");
            expect(line).toContain("breeze");
            expect(line).toContain("12.0s");
        });

        it("should show strained respect at high rank", () => {
            const mem = recordRunResult(emptyMemory(), 7000, emptyHabits());
            expect(greetingLine(mem, "Tempest")).toContain("replays");
        });

        it("should still dread a nemesis regardless of rank", () => {
            const mem = recordRunResult(emptyMemory(), NEMESIS_DRAIN_MS - 1000, emptyHabits());
            expect(greetingLine(mem, "Breeze")).toContain("dream");
        });
    });
});
