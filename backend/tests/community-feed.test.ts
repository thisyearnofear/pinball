import { describe, it, expect, beforeEach } from 'vitest';
import { recordCommunityRun, getRecentRuns, resetCommunityFeed } from '../src/lib/community-feed.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

describe('community feed (socializer loop)', () => {
  beforeEach(() => {
    resetCommunityFeed();
  });

  it('records and returns runs newest-first', () => {
    recordCommunityRun({ address: A, name: 'alice', score: 5000, mode: 'kamikaze', tournamentId: 1, at: 1000 });
    recordCommunityRun({ address: B, name: 'bob', score: 90000, mode: 'classic', tournamentId: 1, at: 2000 });

    const recent = getRecentRuns(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].address).toBe(B); // most recent first
    expect(recent[1].address).toBe(A);
  });

  it('respects the limit argument', () => {
    for (let i = 0; i < 5; i++) {
      recordCommunityRun({ address: A, name: `p${i}`, score: i, mode: 'classic', tournamentId: 1, at: i });
    }
    expect(getRecentRuns(3)).toHaveLength(3);
  });

  it('caps storage at 20 entries', () => {
    for (let i = 0; i < 30; i++) {
      recordCommunityRun({ address: A, name: `p${i}`, score: i, mode: 'classic', tournamentId: 1, at: i });
    }
    const all = getRecentRuns(100);
    expect(all).toHaveLength(20);
    // The newest run survives; the oldest is evicted.
    expect(all[0].name).toBe('p29');
    expect(all.map((r) => r.name)).not.toContain('p0');
  });

  it('clamps a negative limit to an empty result', () => {
    recordCommunityRun({ address: A, name: 'alice', score: 5000, mode: 'kamikaze', tournamentId: 1, at: 1000 });
    expect(getRecentRuns(-5)).toHaveLength(0);
  });
});
