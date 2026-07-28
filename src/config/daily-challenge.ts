import type { GameMode } from "@/config/tournaments";
import type { AIDifficulty } from "@/model/kamikaze";
import { getFromStorage, setInStorage } from "@/utils/local-storage";

/**
 * Daily Challenge — a lightweight retention hook.
 *
 * Every calendar day the "wind shifts": a deterministic seed derived from the
 * date selects a mode, world and machine difficulty. All players face the same
 * challenge on the same day, and each player's local best for that day is
 * persisted. No backend, no wallet — pure client-side, gives returning players
 * a reason to come back and a target to beat.
 *
 * DRY/PERFORMANT: seed math is a tiny deterministic hash; no deps.
 */

export type DailyChallenge = {
  /** Stable key for the calendar day, e.g. "2026-07-27". */
  dayKey: string;
  /** Deterministic per-day seed for table/replay variety. */
  seed: number;
  mode: GameMode;
  worldId: string;
  aiDifficulty: AIDifficulty;
};

const WORLDS = ["hobbiton", "spaceship", "cottage", "pirate-ship", "haunted-house", "sakura-shrine"];
const MODES: GameMode[] = ["kamikaze", "classic"];
const DIFFICULTIES: AIDifficulty[] = ["easy", "medium", "hard"];

const PB_PREFIX = "pinball_daily_pb_";

/** Local midnight calendar key. Stable within a day, rolls over at midnight. */
function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Small deterministic string hash (FNV-1a) so all clients agree on the seed. */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The active daily challenge, derived purely from the calendar date. */
export function getDailyChallenge(d = new Date()): DailyChallenge {
  const dayKey = todayKey(d);
  const seed = hashSeed(`kamikaze-ball:${dayKey}`);
  return {
    dayKey,
    seed,
    mode: MODES[seed % MODES.length],
    worldId: WORLDS[Math.floor(seed / 7) % WORLDS.length],
    aiDifficulty: DIFFICULTIES[Math.floor(seed / 49) % DIFFICULTIES.length],
  };
}

/** Lower is better in kamikaze; higher is better in classic. */
function isBetter(score: number, prevBest: number, mode: GameMode): boolean {
  if (score <= 0) return false;
  if (prevBest === 0) return true;
  return mode === "kamikaze" ? score < prevBest : score > prevBest;
}

/** Read the persisted best for a given day's challenge. 0 = none yet. */
export function getDailyBest(dayKey: string): number {
  const raw = getFromStorage(`${PB_PREFIX}${dayKey}`);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Record a run against the daily challenge. Returns the updated best and
 * whether this run set a new personal best for the day.
 */
export function recordDailyRun(challenge: DailyChallenge, score: number): { best: number; isPB: boolean } {
  const prev = getDailyBest(challenge.dayKey);
  if (isBetter(score, prev, challenge.mode)) {
    setInStorage(`${PB_PREFIX}${challenge.dayKey}`, String(score));
    return { best: score, isPB: true };
  }
  return { best: prev, isPB: false };
}
