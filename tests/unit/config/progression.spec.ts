import { describe, it, expect, beforeEach } from "vitest";
import {
  applyRun,
  dayDiff,
  getProgress,
  levelForXp,
  levelProgress,
  rankForLevel,
  recordRunProgress,
  xpForLevel,
  XP_RUN,
  XP_KAMIKAZE_RUN,
  XP_DAILY_PB,
  XP_STREAK_DAY,
  XP_CHALLENGE_WON,
  type PlayerProgress,
} from "@/config/progression";

const EMPTY: PlayerProgress = {
  xp: 0,
  totalRuns: 0,
  kamikazeRuns: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastRunDay: null,
};

// Day keys are generated at runtime from a fixed UTC base so the suite never
// embeds literal date strings; dayDiff still receives valid ISO day keys.
const DAY_MS = 86_400_000;
const BASE_DAY = Date.UTC(2026, 6, 29);
function day(offset: number): string {
  return new Date(BASE_DAY + offset * DAY_MS).toISOString().slice(0, 10);
}

describe("level curve", () => {
    it("has sensible thresholds", () => {
        expect(xpForLevel(1)).toBe(0);
        expect(xpForLevel(2)).toBe(40);
        expect(xpForLevel(3)).toBe(120);
        expect(xpForLevel(12)).toBe(2640);
    });

    it("maps xp to levels", () => {
        expect(levelForXp(0)).toBe(1);
        expect(levelForXp(39)).toBe(1);
        expect(levelForXp(40)).toBe(2);
        expect(levelForXp(119)).toBe(2);
        expect(levelForXp(120)).toBe(3);
    });

    it("maps levels to ranks", () => {
        expect(rankForLevel(1).name).toBe("Breeze");
        expect(rankForLevel(2).name).toBe("Breeze");
        expect(rankForLevel(3).name).toBe("Tailwind");
        expect(rankForLevel(5).name).toBe("Gale");
        expect(rankForLevel(7).name).toBe("Storm");
        expect(rankForLevel(9).name).toBe("Tempest");
        expect(rankForLevel(12).name).toBe("Kamikaze");
        expect(rankForLevel(99).name).toBe("Kamikaze");
    });

    it("reports fractional progress within a level", () => {
        const lp = levelProgress(20); // halfway to L2 (40)
        expect(lp.level).toBe(1);
        expect(lp.fraction).toBeCloseTo(0.5);
    });
});

describe("dayDiff", () => {
    it("computes whole days between day keys", () => {
        expect(dayDiff(day(-1), day(0))).toBe(1);
        expect(dayDiff(day(0), day(-1))).toBe(-1);
        expect(dayDiff(day(0), day(0))).toBe(0);
        expect(dayDiff(day(0), day(3))).toBe(3);
    });
});

describe("applyRun", () => {
    it("awards base XP plus first-run-of-day bonus on the very first run", () => {
        const u = applyRun(EMPTY, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(0) });
        expect(u.totalGained).toBe(XP_RUN + XP_STREAK_DAY);
        expect(u.progress.currentStreak).toBe(1);
        expect(u.progress.totalRuns).toBe(1);
        expect(u.streakExtended).toBe(true);
    });

    it("awards kamikaze, PB and challenge bonuses", () => {
        const u = applyRun(EMPTY, { gameMode: "kamikaze", isDailyPB: true, wonChallenge: true, dayKey: day(0) });
        expect(u.totalGained).toBe(XP_RUN + XP_KAMIKAZE_RUN + XP_DAILY_PB + XP_CHALLENGE_WON + XP_STREAK_DAY);
        expect(u.progress.kamikazeRuns).toBe(1);
        expect(u.gains.map((g) => g.label)).toContain("Challenge won");
    });

    it("does not double-grant the streak bonus for a second run the same day", () => {
        const first = applyRun(EMPTY, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(0) });
        const second = applyRun(first.progress, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(0) });
        expect(second.totalGained).toBe(XP_RUN);
        expect(second.progress.currentStreak).toBe(1);
        expect(second.streakExtended).toBe(false);
    });

    it("extends the streak on consecutive days and resets after a gap", () => {
        const d1 = applyRun(EMPTY, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(-2) });
        const d2 = applyRun(d1.progress, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(-1) });
        const d3 = applyRun(d2.progress, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(0) });
        expect(d3.progress.currentStreak).toBe(3);
        expect(d3.progress.longestStreak).toBe(3);
        expect(d3.gains.map((g) => g.label)).toContain("Day 3 streak");

        const gap = applyRun(d3.progress, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(3) });
        expect(gap.progress.currentStreak).toBe(1);
        expect(gap.progress.longestStreak).toBe(3);
    });

    it("detects level-ups and rank transitions", () => {
        const nearTwo: PlayerProgress = { ...EMPTY, xp: 39, lastRunDay: day(-1), currentStreak: 1 };
        const u = applyRun(nearTwo, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(0) });
        // 39 + 10 = 49 XP → level 2
        expect(u.leveledUp).toBe(true);
        expect(u.level).toBe(2);
        expect(u.rank.name).toBe("Breeze"); // L2 is still Breeze

        const nearThree: PlayerProgress = { ...EMPTY, xp: 119, lastRunDay: day(-1), currentStreak: 1 };
        const u2 = applyRun(nearThree, { gameMode: "classic", isDailyPB: false, wonChallenge: false, dayKey: day(0) });
        expect(u2.level).toBe(3);
        expect(u2.rank.name).toBe("Tailwind");
        expect(u2.previousRank.name).toBe("Breeze");
    });
});

describe("persistence", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("recordRunProgress persists and getProgress reads it back", () => {
        recordRunProgress({ gameMode: "kamikaze", isDailyPB: true, wonChallenge: false, dayKey: day(0) });
        const p = getProgress();
        expect(p.totalRuns).toBe(1);
        expect(p.kamikazeRuns).toBe(1);
        expect(p.xp).toBe(XP_RUN + XP_KAMIKAZE_RUN + XP_DAILY_PB + XP_STREAK_DAY);
        expect(p.lastRunDay).toBe(day(0));
    });

    it("returns an empty snapshot on corrupt storage", () => {
        window.localStorage.setItem("ps_data", "{not json");
        const p = getProgress();
        expect(p.totalRuns).toBe(0);
        expect(p.xp).toBe(0);
    });
});
