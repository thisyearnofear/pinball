import { PowerUpType } from "@/definitions/game";

/**
 * Kami Trials — the "commune with the kami while the world holds its breath"
 * pause-time challenges.
 *
 * Design: a pure, deterministic generator keyed off a seed. This is the
 * AI-ready interface: today the seed is derived from the date (all players get
 * the same trials on the same day) plus a per-pause salt for variety, but the
 * `getTrials(seed)` shape is exactly what a future LLM generator would return,
 * so swapping in real AI generation later is a drop-in replacement with zero
 * refactor of the UI.
 *
 * Three trial archetypes:
 *   - timing:  stop a sweeping bar inside the target zone.
 *   - memory:  repeat a growing kanji sequence.
 *   - drawing: trace a stroke path within tolerance.
 *
 * Performance: all generation is O(1)/O(n) over tiny fixed arrays; no deps.
 */

export type TrialKind = "timing" | "memory" | "drawing";

export type TimingTrial = {
  kind: "timing";
  id: string;
  prompt: string;
  /** Sweep speed in zone-units per second (0-1 range). */
  speed: number;
  /** Target zone as a fraction [start, end] of the bar (0-1). */
  zoneStart: number;
  zoneEnd: number;
};

export type MemoryTrial = {
  kind: "memory";
  id: string;
  prompt: string;
  /** The kanji glyphs the player must repeat in order. */
  sequence: string[];
  /** How long each glyph is shown (ms). */
  flashMs: number;
};

export type DrawingTrial = {
  kind: "drawing";
  id: string;
  prompt: string;
  /** Ordered stroke points as [x, y] in a 0-1 space. */
  points: [number, number][];
  /** Max distance (0-1) a traced point may be from the ideal path. */
  tolerance: number;
};

export type Trial = TimingTrial | MemoryTrial | DrawingTrial;

const KANJI_POOL = ["風", "火", "水", "山", "雷", "月", "花", "龍", "刀", "魂"];
const DRAWING_STROKES: [number, number][][] = [
  // A rising diagonal (like a sword slash).
  [[0.15, 0.85], [0.5, 0.5], [0.85, 0.15]],
  // A descending hook.
  [[0.2, 0.2], [0.5, 0.6], [0.8, 0.75]],
  // A shallow arc.
  [[0.1, 0.5], [0.35, 0.3], [0.65, 0.3], [0.9, 0.5]],
  // A zig-zag.
  [[0.1, 0.3], [0.4, 0.7], [0.6, 0.3], [0.9, 0.7]],
];
const TIMING_PROMPTS = ["Stop the wind in the calm", "Catch the falling petal", "Hold the breath at the gate"];
const MEMORY_PROMPTS = ["Remember the kami's words", "Echo the sacred sequence", "Trace the memory of the shrine"];
const DRAWING_PROMPTS = ["Draw the slash of the wind", "Inscribe the ward", "Sign your intent"];

/** Small deterministic hash (FNV-1a) so all clients agree on the seed. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded per-trial for reproducible variety. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

/**
 * Generate the three trials for a given seed. Pure and deterministic: the same
 * seed always yields the same three trials. This is the AI-ready seam.
 */
export function getTrials(seed: number): Trial[] {
  // Fixed rotation so every pause offers all three archetypes, but the
  // per-trial content varies with the seed.
  return [
    makeTimingTrials(seed ^ 0x1),
    makeMemoryTrials(seed ^ 0x2),
    makeDrawingTrials(seed ^ 0x3),
  ];
}

function makeTimingTrials(seed: number): TimingTrial {
  const r = rng(seed);
  // Higher seed entropy → faster, smaller zone (harder).
  const zoneWidth = 0.12 + r() * 0.12; // 0.12-0.24 of the bar
  const zoneStart = 0.1 + r() * (0.8 - zoneWidth);
  return {
    kind: "timing",
    id: `timing-${seed}`,
    prompt: pick(r, TIMING_PROMPTS),
    speed: 0.6 + r() * 0.7,
    zoneStart,
    zoneEnd: zoneStart + zoneWidth,
  };
}

function makeMemoryTrials(seed: number): MemoryTrial {
  const r = rng(seed);
  const length = 3 + Math.floor(r() * 3); // 3-5 glyphs
  const sequence: string[] = [];
  const pool = [...KANJI_POOL];
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(r() * pool.length);
    sequence.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return {
    kind: "memory",
    id: `memory-${seed}`,
    prompt: pick(r, MEMORY_PROMPTS),
    sequence,
    flashMs: 700,
  };
}

function makeDrawingTrials(seed: number): DrawingTrial {
  const r = rng(seed);
  return {
    kind: "drawing",
    id: `drawing-${seed}`,
    prompt: pick(r, DRAWING_PROMPTS),
    points: pick(r, DRAWING_STROKES),
    tolerance: 0.12 + r() * 0.06, // 0.12-0.18
  };
}

/**
 * Boons a successful trial can grant. All are player-side power-ups that
 * already exist in the engine, so the reward plugs straight into play.
 */
const PLAYER_BOONS: PowerUpType[] = [
  PowerUpType.HOMING_WARHEAD,
  PowerUpType.FLIPPER_JAM,
  PowerUpType.GHOST_BALL,
  PowerUpType.SAKURA_STORM,
];

export type TrialReward = {
  type: PowerUpType;
  /** Reward duration scales with how well the player did (0-1). */
  durationMs: number;
};

const MIN_BOON_MS = 2500;
const MAX_BOON_MS = 5000;

/**
 * Map a trial result to a boon. `accuracy` is 0-1 (how well the player did);
 * the seed picks WHICH boon deterministically so it feels curated, and the
 * accuracy scales HOW LONG it lasts. Returns null for a failed trial.
 */
export function rewardForTrials(seed: number, accuracy: number): TrialReward | null {
  if (accuracy <= 0.2) return null; // failed outright
  const r = rng(seed ^ 0x9e3779b9);
  const type = pick(r, PLAYER_BOONS);
  const durationMs = Math.round(MIN_BOON_MS + (MAX_BOON_MS - MIN_BOON_MS) * Math.min(1, accuracy));
  return { type, durationMs };
}
