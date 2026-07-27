import { keccak256, toUtf8Bytes } from 'ethers';
import { MIN_DRAIN_MS, type GameMode, type GameMetadata } from './validation.js';

/**
 * Replay plausibility verification.
 *
 * Exact re-simulation is impossible server-side (live runs use wall-clock AI
 * timing), so this verifies that a replay is structurally sound and physically
 * plausible: no teleports, positions inside the table, drain segments that can
 * actually produce the claimed kamikaze score, and human-possible input rates.
 * Modes (env REPLAY_VERIFICATION): strict = reject on failure, warn = log only,
 * off = skip entirely.
 */

const TICK_MS = 1000 / 60; // engine fixed timestep
const MAX_EVENTS = 2500;
const MAX_TRACE_SAMPLES = 4500;

// Table bounds with margin (table1 is 800x2441; ball can briefly overshoot)
const MIN_X = -150;
const MAX_X = 1000;
const MIN_Y = -150;
const MAX_Y = 2650;

// Generous ball speed ceiling: matter.js balls rarely exceed ~40px/tick even
// off a popper; 120px/tick catches fabricated traces without false positives.
const MAX_PX_PER_TICK = 120;

// Human tap ceiling for kamikaze nudges (per rolling second)
const MAX_NUDGES_PER_SECOND = 15;
const TICKS_PER_SECOND = 60;

const VALID_EVENTS = new Set(['L+', 'L-', 'R+', 'R-', 'bump', 'nudge', 'spawn', 'drain']);

export type ReplayVerdict = {
  ok: boolean;
  failures: string[];
};

type ReplayEvent = { t: number; e: string; x?: number; y?: number };

export function verifyReplay(
  replayJson: string,
  ctx: { score: number; mode: GameMode; metadata: GameMetadata; replayHash?: string }
): ReplayVerdict {
  const failures: string[] = [];

  if (ctx.replayHash) {
    const actual = keccak256(toUtf8Bytes(replayJson));
    if (actual.toLowerCase() !== ctx.replayHash.toLowerCase()) {
      return { ok: false, failures: ['HASH_MISMATCH'] };
    }
  }

  let digest: any;
  try {
    digest = JSON.parse(replayJson);
  } catch {
    return { ok: false, failures: ['REPLAY_INVALID_JSON'] };
  }

  // --- Structural checks ---
  if (typeof digest !== 'object' || digest === null || digest.v !== 1) {
    return { ok: false, failures: ['REPLAY_BAD_VERSION'] };
  }
  if (!Number.isFinite(digest.seed)) failures.push('REPLAY_BAD_SEED');
  if (!Number.isInteger(digest.table) || digest.table < 0) failures.push('REPLAY_BAD_TABLE');
  if (digest.mode !== 'classic' && digest.mode !== 'kamikaze') failures.push('REPLAY_BAD_MODE');
  else if (digest.mode !== ctx.mode) failures.push('REPLAY_MODE_MISMATCH');
  if (!Number.isInteger(digest.tickCount) || digest.tickCount <= 0) failures.push('REPLAY_BAD_TICKCOUNT');
  if (!Number.isFinite(digest.finalScore)) failures.push('REPLAY_BAD_SCORE');
  else if (digest.finalScore !== ctx.score) failures.push('REPLAY_SCORE_MISMATCH');
  if (!Array.isArray(digest.events)) failures.push('REPLAY_BAD_EVENTS');
  if (failures.length) return { ok: false, failures };

  const events = digest.events as ReplayEvent[];
  const tickCount = digest.tickCount as number;
  const truncated = Boolean(digest.truncated);

  if (events.length > MAX_EVENTS) failures.push('REPLAY_TOO_MANY_EVENTS');

  // Events must be tick-ordered and inside the run
  let prevTick = -1;
  for (const ev of events) {
    if (typeof ev !== 'object' || ev === null || !Number.isInteger(ev.t) || !VALID_EVENTS.has(ev.e)) {
      failures.push('REPLAY_MALFORMED_EVENT');
      break;
    }
    if (ev.t < prevTick) {
      failures.push('REPLAY_EVENTS_UNSORTED');
      break;
    }
    if (ev.t < 0 || ev.t > tickCount + TICKS_PER_SECOND) {
      failures.push('REPLAY_EVENT_OUT_OF_RANGE');
      break;
    }
    prevTick = ev.t;
  }

  // --- Duration consistency ---
  // Ticks only advance while the sim runs; wall-clock duration includes pauses,
  // so tick time must not exceed the reported duration by more than tolerance.
  const duration = typeof ctx.metadata.duration === 'number' ? ctx.metadata.duration : undefined;
  if (duration !== undefined && duration > 0) {
    const tickMs = tickCount * TICK_MS;
    if (tickMs > duration * 1.25 + 5_000) failures.push('REPLAY_TICKS_EXCEED_DURATION');
  }

  // --- Kamikaze score derivation from spawn/drain segments ---
  if (ctx.mode === 'kamikaze' && !truncated) {
    const segments: number[] = [];
    let openSpawnTick: number | null = null;
    for (const ev of events) {
      if (ev.e === 'spawn') {
        openSpawnTick = ev.t;
      } else if (ev.e === 'drain' && openSpawnTick !== null) {
        segments.push((ev.t - openSpawnTick) * TICK_MS);
        openSpawnTick = null;
      }
    }
    if (segments.length === 0) {
      failures.push('REPLAY_NO_DRAIN_SEGMENTS');
    } else {
      // Kamikaze score = best (lowest) ball's time-alive + penalties (which only
      // add). A claimed score meaningfully below the shortest recorded segment
      // is fabricated. 1s tolerance absorbs spawn/drain event timing skew.
      const minSegment = Math.min(...segments);
      if (ctx.score < minSegment - 1_000) failures.push('REPLAY_SCORE_BELOW_SEGMENTS');
      if (ctx.score < MIN_DRAIN_MS) failures.push('REPLAY_SCORE_BELOW_FLOOR');
    }
  }

  // --- Input sanity: human nudge-rate ceiling ---
  const nudgeTicks = events.filter((e) => e.e === 'nudge').map((e) => e.t);
  for (let i = 0; i + MAX_NUDGES_PER_SECOND < nudgeTicks.length; i++) {
    if (nudgeTicks[i + MAX_NUDGES_PER_SECOND] - nudgeTicks[i] < TICKS_PER_SECOND) {
      failures.push('REPLAY_NUDGE_RATE_INHUMAN');
      break;
    }
  }

  // --- Trace physics plausibility ---
  const trace = digest.trace;
  if (trace !== undefined) {
    if (!Array.isArray(trace) || trace.length % 3 !== 0 || trace.length > MAX_TRACE_SAMPLES * 3) {
      failures.push('REPLAY_BAD_TRACE');
    } else {
      // Respawn teleports (drain -> popper) are legit; allow one per spawn.
      const spawnCount = events.filter((e) => e.e === 'spawn').length;
      let teleports = 0;
      for (let i = 0; i < trace.length; i += 3) {
        const t = trace[i];
        const x = trace[i + 1];
        const y = trace[i + 2];
        if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) {
          failures.push('REPLAY_BAD_TRACE');
          break;
        }
        if (x < MIN_X || x > MAX_X || y < MIN_Y || y > MAX_Y) {
          failures.push('REPLAY_TRACE_OUT_OF_BOUNDS');
          break;
        }
        if (i >= 3) {
          const dt = t - trace[i - 3];
          if (dt <= 0) {
            failures.push('REPLAY_TRACE_TICKS_NOT_INCREASING');
            break;
          }
          const dist = Math.hypot(x - trace[i - 2], y - trace[i - 1]);
          if (dist > dt * MAX_PX_PER_TICK) teleports++;
        }
      }
      if (teleports > spawnCount + 2) failures.push('REPLAY_TRACE_TELEPORTS');
    }
  }

  return { ok: failures.length === 0, failures };
}
