import { describe, it, expect } from 'vitest';
import { keccak256, toUtf8Bytes } from 'ethers';
import { verifyReplay } from '../src/lib/replay-verifier.js';

const TICK_MS = 1000 / 60;

function makeDigest(overrides: Record<string, any> = {}) {
  // A plausible 3-ball kamikaze run: segments of ~600, ~300, ~200 ticks
  const events = [
    { t: 0, e: 'spawn' },
    { t: 10, e: 'L+' }, { t: 20, e: 'L-' },
    { t: 100, e: 'nudge', x: 300, y: 900 },
    { t: 600, e: 'drain' },
    { t: 650, e: 'spawn' },
    { t: 950, e: 'drain' },
    { t: 1000, e: 'spawn' },
    { t: 1200, e: 'drain' },
  ];
  return {
    v: 1,
    seed: 123456,
    table: 1,
    mode: 'kamikaze',
    aiDifficulty: 'medium',
    tickCount: 1250,
    finalScore: Math.round(200 * TICK_MS), // best (lowest) segment ≈ 3333ms
    truncated: false,
    events,
    ...overrides,
  };
}

function ctxFor(digest: any, metadata: Record<string, any> = {}) {
  return {
    score: digest.finalScore,
    mode: digest.mode,
    metadata: { mode: digest.mode, duration: Math.round(digest.tickCount * TICK_MS * 1.1), ...metadata },
  };
}

describe('verifyReplay', () => {
  it('accepts a plausible kamikaze replay', () => {
    const digest = makeDigest();
    const verdict = verifyReplay(JSON.stringify(digest), ctxFor(digest));
    expect(verdict.failures).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  it('verifies the keccak hash binding when provided', () => {
    const digest = makeDigest();
    const json = JSON.stringify(digest);
    const hash = keccak256(toUtf8Bytes(json));
    expect(verifyReplay(json, { ...ctxFor(digest), replayHash: hash }).ok).toBe(true);
    expect(verifyReplay(json, { ...ctxFor(digest), replayHash: '0x' + 'ab'.repeat(32) }).failures).toContain('HASH_MISMATCH');
  });

  it('rejects invalid JSON and bad version', () => {
    expect(verifyReplay('not json', { score: 1000, mode: 'kamikaze', metadata: {} }).failures).toContain('REPLAY_INVALID_JSON');
    const digest = makeDigest({ v: 2 });
    expect(verifyReplay(JSON.stringify(digest), ctxFor(digest)).failures).toContain('REPLAY_BAD_VERSION');
  });

  it('rejects mode and score mismatches with the signed submission', () => {
    const digest = makeDigest();
    const json = JSON.stringify(digest);
    expect(verifyReplay(json, { ...ctxFor(digest), mode: 'classic' }).failures).toContain('REPLAY_MODE_MISMATCH');
    expect(verifyReplay(json, { ...ctxFor(digest), score: digest.finalScore + 1 }).failures).toContain('REPLAY_SCORE_MISMATCH');
  });

  it('rejects unsorted and out-of-range events', () => {
    const unsorted = makeDigest({ events: [{ t: 100, e: 'L+' }, { t: 50, e: 'L-' }] });
    expect(verifyReplay(JSON.stringify(unsorted), ctxFor(unsorted)).failures).toContain('REPLAY_EVENTS_UNSORTED');

    const outOfRange = makeDigest({ events: [{ t: 99999, e: 'L+' }] });
    expect(verifyReplay(JSON.stringify(outOfRange), ctxFor(outOfRange)).failures).toContain('REPLAY_EVENT_OUT_OF_RANGE');
  });

  it('rejects tick counts that exceed wall-clock duration', () => {
    const digest = makeDigest();
    // Claim the run took only 2 seconds of wall-clock time
    const verdict = verifyReplay(JSON.stringify(digest), ctxFor(digest, { duration: 2_000 }));
    expect(verdict.failures).toContain('REPLAY_TICKS_EXCEED_DURATION');
  });

  it('rejects a kamikaze score below any recorded drain segment', () => {
    // Shortest segment is 200 ticks ≈ 3333ms; claiming a 900ms drain is fabricated
    const digest = makeDigest({ finalScore: 900 });
    const verdict = verifyReplay(JSON.stringify(digest), ctxFor(digest));
    expect(verdict.failures).toContain('REPLAY_SCORE_BELOW_SEGMENTS');
  });

  it('rejects kamikaze replays with no drain segments', () => {
    const digest = makeDigest({ events: [{ t: 0, e: 'spawn' }] });
    const verdict = verifyReplay(JSON.stringify(digest), ctxFor(digest));
    expect(verdict.failures).toContain('REPLAY_NO_DRAIN_SEGMENTS');
  });

  it('rejects inhuman nudge rates', () => {
    const nudges = Array.from({ length: 30 }, (_, i) => ({ t: i, e: 'nudge', x: 300, y: 900 }));
    const digest = makeDigest({ events: [{ t: 0, e: 'spawn' }, ...nudges, { t: 600, e: 'drain' }] });
    const verdict = verifyReplay(JSON.stringify(digest), ctxFor(digest));
    expect(verdict.failures).toContain('REPLAY_NUDGE_RATE_INHUMAN');
  });

  describe('trace physics', () => {
    it('accepts a smooth trace', () => {
      const trace: number[] = [];
      for (let t = 0; t <= 600; t += 4) trace.push(t, 400 + Math.round(t / 10), 1000 + t);
      const digest = makeDigest({ trace });
      expect(verifyReplay(JSON.stringify(digest), ctxFor(digest)).ok).toBe(true);
    });

    it('rejects out-of-bounds positions', () => {
      const digest = makeDigest({ trace: [0, 5000, 1000, 4, 5000, 1010] });
      expect(verifyReplay(JSON.stringify(digest), ctxFor(digest)).failures).toContain('REPLAY_TRACE_OUT_OF_BOUNDS');
    });

    it('rejects traces with more teleports than ball spawns allow', () => {
      // 6 giant jumps but only 3 spawns (+2 slack) permitted
      const trace: number[] = [];
      let x = 100;
      for (let i = 0; i < 7; i++) {
        trace.push(i * 4, x, 100);
        x = x === 100 ? 900 : 100; // 800px jump every 4 ticks
      }
      const digest = makeDigest({ trace });
      expect(verifyReplay(JSON.stringify(digest), ctxFor(digest)).failures).toContain('REPLAY_TRACE_TELEPORTS');
    });

    it('rejects non-increasing trace ticks', () => {
      const digest = makeDigest({ trace: [10, 100, 100, 10, 110, 110] });
      expect(verifyReplay(JSON.stringify(digest), ctxFor(digest)).failures).toContain('REPLAY_TRACE_TICKS_NOT_INCREASING');
    });
  });

  it('accepts classic replays without drain-segment scoring', () => {
    const digest = makeDigest({ mode: 'classic', finalScore: 250_000, aiDifficulty: undefined });
    const verdict = verifyReplay(JSON.stringify(digest), ctxFor(digest));
    expect(verdict.ok).toBe(true);
  });
});
