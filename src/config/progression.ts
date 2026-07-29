import { getFromStorage, setInStorage } from "@/utils/local-storage";

/**
 * Progression — the meta-retention layer.
 *
 * Every run earns XP toward wind-themed ranks (そよ風 Breeze → 神風 Kamikaze).
 * Playing on consecutive days builds a streak. Personal bests and won
 * challenges pay bonus XP. All client-side (no wallet, no backend), persisted
 * in localStorage, so returning players always have a next milestone.
 */

export type Rank = {
  minLevel: number;
  kanji: string;
  name: string;
};

export const RANKS: Rank[] = [
  { minLevel: 1, kanji: "そよ風", name: "Breeze" },
  { minLevel: 3, kanji: "追い風", name: "Tailwind" },
  { minLevel: 5, kanji: "疾風", name: "Gale" },
  { minLevel: 7, kanji: "嵐", name: "Storm" },
  { minLevel: 9, kanji: "烈風", name: "Tempest" },
  { minLevel: 12, kanji: "神風", name: "Kamikaze" },
];

export type PlayerProgress = {
  xp: number;
  totalRuns: number;
  kamikazeRuns: number;
  /** Consecutive calendar days with at least one run. */
  currentStreak: number;
  longestStreak: number;
  /** Day key (yyyy-mm-dd) of the most recent run, null before the first. */
  lastRunDay: string | null;
  /** One-time early-win bonus already granted (first in-game action). */
  earlyWinClaimed: boolean;
};

export type ProgressEvent = {
  gameMode: "classic" | "kamikaze";
  /** The run set a new daily-challenge personal best. */
  isDailyPB: boolean;
  /** The run beat a friend-challenge link score. */
  wonChallenge: boolean;
  /** Calendar day key of the run, e.g. "2026-07-29". */
  dayKey: string;
};

export type XpGain = { label: string; xp: number };

export type ProgressUpdate = {
  progress: PlayerProgress;
  gains: XpGain[];
  totalGained: number;
  previousRank: Rank;
  rank: Rank;
  level: number;
  previousLevel: number;
  leveledUp: boolean;
  streakExtended: boolean;
};

const STORAGE_KEY = "pinball_progress";

export const XP_RUN = 10;
export const XP_KAMIKAZE_RUN = 5;
export const XP_DAILY_PB = 25;
export const XP_STREAK_DAY = 15;
export const XP_CHALLENGE_WON = 30;
/** One-time bonus for the player's very first in-game action (early win). */
export const XP_FIRST_ACTION = 15;

/** Cumulative XP required to be at `level`. L1 = 0, L2 = 40, L3 = 120, … */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 20 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function rankForLevel(level: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
  }
  return rank;
}

/** Progress within the current level, for the XP bar. */
export function levelProgress(xp: number): { level: number; intoLevel: number; needed: number; fraction: number } {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const intoLevel = xp - floor;
  const needed = ceil - floor;
  return { level, intoLevel, needed, fraction: needed > 0 ? intoLevel / needed : 1 };
}

function emptyProgress(): PlayerProgress {
  return { xp: 0, totalRuns: 0, kamikazeRuns: 0, currentStreak: 0, longestStreak: 0, lastRunDay: null, earlyWinClaimed: false };
}

export function getProgress(): PlayerProgress {
  try {
    const raw = getFromStorage(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    return { ...emptyProgress(), ...parsed };
  } catch {
    return emptyProgress();
  }
}

/** Whole days between two yyyy-mm-dd keys; negative if a is before b. */
export function dayDiff(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return 0;
  return Math.round((pb - pa) / 86_400_000);
}

/**
 * Apply a finished run to a progress snapshot. Pure: returns the next state
 * plus the XP breakdown for the celebration screen.
 */
export function applyRun(prev: PlayerProgress, event: ProgressEvent): ProgressUpdate {
  const previousLevel = levelForXp(prev.xp);
  const previousRank = rankForLevel(previousLevel);

  const gains: XpGain[] = [{ label: "Run complete", xp: XP_RUN }];
  if (event.gameMode === "kamikaze") gains.push({ label: "Kamikaze run", xp: XP_KAMIKAZE_RUN });
  if (event.isDailyPB) gains.push({ label: "New daily best", xp: XP_DAILY_PB });
  if (event.wonChallenge) gains.push({ label: "Challenge won", xp: XP_CHALLENGE_WON });

  let currentStreak = prev.currentStreak;
  let streakExtended = false;
  if (prev.lastRunDay !== event.dayKey) {
    currentStreak = prev.lastRunDay && dayDiff(prev.lastRunDay, event.dayKey) === 1 ? prev.currentStreak + 1 : 1;
    streakExtended = true;
    gains.push({ label: currentStreak > 1 ? `Day ${currentStreak} streak` : "First run of the day", xp: XP_STREAK_DAY });
  }

  const totalGained = gains.reduce((sum, g) => sum + g.xp, 0);
  const xp = prev.xp + totalGained;
  const level = levelForXp(xp);

  const progress: PlayerProgress = {
    xp,
    totalRuns: prev.totalRuns + 1,
    kamikazeRuns: prev.kamikazeRuns + (event.gameMode === "kamikaze" ? 1 : 0),
    currentStreak,
    longestStreak: Math.max(prev.longestStreak, currentStreak),
    lastRunDay: event.dayKey,
    earlyWinClaimed: prev.earlyWinClaimed,
  };

  return {
    progress,
    gains,
    totalGained,
    previousRank,
    rank: rankForLevel(level),
    level,
    previousLevel,
    leveledUp: level > previousLevel,
    streakExtended,
  };
}

/** Load, apply and persist a run. Returns the update for UI celebration. */
export function recordRunProgress(event: ProgressEvent): ProgressUpdate {
  const update = applyRun(getProgress(), event);
  try {
    setInStorage(STORAGE_KEY, JSON.stringify(update.progress));
  } catch {}
  return update;
}

export type EarlyWinResult = {
  granted: boolean;
  progress: PlayerProgress;
  level: number;
  rank: Rank;
  leveledUp: boolean;
  previousLevel: number;
};

/**
 * One-time "early win": the first deliberate in-game action grants bonus XP so
 * the player feels rewarded before their first run even ends. Idempotent — once
 * claimed it never fires again. Returns whether a grant happened this call.
 */
export function grantEarlyWin(): EarlyWinResult {
  const prev = getProgress();
  const previousLevel = levelForXp(prev.xp);
  if (prev.earlyWinClaimed) {
    return { granted: false, progress: prev, level: previousLevel, rank: rankForLevel(previousLevel), leveledUp: false, previousLevel };
  }
  const xp = prev.xp + XP_FIRST_ACTION;
  const level = levelForXp(xp);
  const progress: PlayerProgress = { ...prev, xp, earlyWinClaimed: true };
  try {
    setInStorage(STORAGE_KEY, JSON.stringify(progress));
  } catch {}
  return { granted: true, progress, level, rank: rankForLevel(level), leveledUp: level > previousLevel, previousLevel };
}
