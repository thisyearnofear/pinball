/**
 * Score formatting helpers shared across HUD, overlays, and leaderboards.
 * Kamikaze scores are drain times in milliseconds (lower = better),
 * displayed as seconds; classic scores are plain points.
 */

export function formatGameScore(score: number, kamikaze: boolean): string {
  if (kamikaze) return `${(score / 1000).toFixed(1)}s`;
  return score.toLocaleString();
}

export function scoreUnit(kamikaze: boolean): string {
  return kamikaze ? "drain time" : "pts";
}
