/**
 * Community feed — a persistent, cross-player "recent runs" ring buffer.
 *
 * Powers the Socializer loop: the lobby shows what other players just did
 * (drains / scores), so the arena feels alive and gives each run a rival to
 * race. Populated whenever a score is signed; read via GET /api/community/recent.
 *
 * In-memory for MVP (shared across all players on the server, survives any
 * single session, resets on restart). Swap for Redis when scaling.
 */

export type CommunityRun = {
  address: string;
  name: string;
  score: number;
  mode: 'classic' | 'kamikaze';
  tournamentId: number;
  at: number;
};

const MAX_RUNS = 20;

const runs: CommunityRun[] = [];

/** Record a finished run at the front of the feed (most recent first). */
export function recordCommunityRun(run: CommunityRun): void {
  runs.unshift({
    address: run.address,
    // Trim display name; wallet addresses are safe to show truncated client-side.
    name: run.name || '',
    score: run.score,
    mode: run.mode,
    tournamentId: run.tournamentId,
    at: Date.now(),
  });
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
}

/** Most recent runs, newest first. */
export function getRecentRuns(limit = MAX_RUNS): CommunityRun[] {
  return runs.slice(0, Math.max(0, Math.min(limit, MAX_RUNS)));
}

/** Test helper: clear the feed. */
export function resetCommunityFeed(): void {
  runs.length = 0;
}
