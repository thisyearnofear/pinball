import { describe, it, expect } from 'vitest';
import { maybeStoreBestReplay, getBestReplay } from '../src/routes/replays.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const replayA = '{"v":1,"events":[]}';
const replayB = '{"v":1,"events":[{"t":0,"e":"spawn"}]}';

describe('best replay store (ghost racing)', () => {
  it('stores the first replay for a tournament', async () => {
    expect(await maybeStoreBestReplay(101, A, 5000, 'kamikaze', replayA)).toBe(true);
    const best = await getBestReplay(101);
    expect(best?.address).toBe(A);
    expect(best?.score).toBe(5000);
  });

  it('kamikaze: lower score replaces, higher does not', async () => {
    await maybeStoreBestReplay(102, A, 5000, 'kamikaze', replayA);
    expect(await maybeStoreBestReplay(102, B, 7000, 'kamikaze', replayB)).toBe(false);
    expect((await getBestReplay(102))?.address).toBe(A);
    expect(await maybeStoreBestReplay(102, B, 3000, 'kamikaze', replayB)).toBe(true);
    expect((await getBestReplay(102))?.address).toBe(B);
  });

  it('classic: higher score replaces, lower does not', async () => {
    await maybeStoreBestReplay(103, A, 100_000, 'classic', replayA);
    expect(await maybeStoreBestReplay(103, B, 50_000, 'classic', replayB)).toBe(false);
    expect(await maybeStoreBestReplay(103, B, 200_000, 'classic', replayB)).toBe(true);
    expect((await getBestReplay(103))?.score).toBe(200_000);
  });

  it('returns null for tournaments without a best replay', async () => {
    expect(await getBestReplay(9999)).toBeNull();
  });

  it('carries the signed score metadata alongside the replay', async () => {
    // Ghost viewers verify the replay hash against this payload, so it must
    // round-trip through the store byte-for-byte.
    const metadata = JSON.stringify({ mode: 'kamikaze', replayHash: '0x' + 'ab'.repeat(32) });
    await maybeStoreBestReplay(104, A, 4000, 'kamikaze', replayA, metadata);
    const best = await getBestReplay(104);
    expect(best?.metadata).toBe(metadata);
    expect(best?.replay).toBe(replayA);
  });

  it('omits metadata for entries stored without it (older replays)', async () => {
    await maybeStoreBestReplay(105, A, 4000, 'kamikaze', replayA);
    const best = await getBestReplay(105);
    expect(best?.metadata).toBeUndefined();
  });

  it('replaces a metadata-free leader with one that has metadata', async () => {
    await maybeStoreBestReplay(106, A, 5000, 'kamikaze', replayA);
    const metadata = JSON.stringify({ mode: 'kamikaze', replayHash: '0x' + 'cd'.repeat(32) });
    expect(await maybeStoreBestReplay(106, B, 3000, 'kamikaze', replayB, metadata)).toBe(true);
    const best = await getBestReplay(106);
    expect(best?.address).toBe(B);
    expect(best?.metadata).toBe(metadata);
  });
});
