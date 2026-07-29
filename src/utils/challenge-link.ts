/**
 * Friend-challenge deep links — the core viral loop.
 *
 * A share card can carry a URL that encodes the exact run configuration
 * (mode, world, machine difficulty) plus the score to beat. Opening the link
 * lands in the lobby with a "beat this" banner and a one-tap accept that
 * starts a run under identical conditions.
 *
 * Compact param names (cm/cw/ca/cs/cn) avoid colliding with existing params
 * like `demo`.
 */

export type ChallengeInvite = {
  mode: "classic" | "kamikaze";
  worldId: string;
  aiDifficulty: "easy" | "medium" | "hard";
  /** Score to beat: drain ms (kamikaze, lower wins) or points (classic, higher wins). */
  score: number;
  /** Challenger display name (optional, sanitized, max 24 chars). */
  name?: string;
};

const PARAM_FLAG = "challenge";
const PARAM_MODE = "cm";
const PARAM_WORLD = "cw";
const PARAM_AI = "ca";
const PARAM_SCORE = "cs";
const PARAM_NAME = "cn";

const MODES = ["classic", "kamikaze"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const MAX_SCORE_MS = 3_600_000;
const WORLD_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function buildChallengeUrl(invite: ChallengeInvite, baseUrl?: string): string {
  const base = baseUrl ?? (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "");
  const params = new URLSearchParams();
  params.set(PARAM_FLAG, "1");
  params.set(PARAM_MODE, invite.mode);
  params.set(PARAM_WORLD, invite.worldId);
  params.set(PARAM_AI, invite.aiDifficulty);
  params.set(PARAM_SCORE, String(Math.round(invite.score)));
  if (invite.name) params.set(PARAM_NAME, invite.name.slice(0, 24));
  return `${base}?${params.toString()}`;
}

/** Parse a URL search string; returns null unless every field is valid. */
export function parseChallengeUrl(search: string): ChallengeInvite | null {
  try {
    const params = new URLSearchParams(search);
    if (params.get(PARAM_FLAG) !== "1") return null;

    const mode = params.get(PARAM_MODE);
    if (!MODES.includes(mode as (typeof MODES)[number])) return null;

    const worldId = params.get(PARAM_WORLD) ?? "";
    if (!WORLD_ID_RE.test(worldId)) return null;

    const ai = params.get(PARAM_AI);
    if (!DIFFICULTIES.includes(ai as (typeof DIFFICULTIES)[number])) return null;

    const score = Number(params.get(PARAM_SCORE));
    if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE_MS) return null;

    const rawName = params.get(PARAM_NAME);
    const name = rawName ? rawName.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 24) : undefined;

    return {
      mode: mode as ChallengeInvite["mode"],
      worldId,
      aiDifficulty: ai as ChallengeInvite["aiDifficulty"],
      score,
      ...(name ? { name } : {}),
    };
  } catch {
    return null;
  }
}

/** Kamikaze: faster (lower) drain wins. Classic: higher score wins. */
export function didBeatChallenge(invite: ChallengeInvite, score: number): boolean {
  if (score <= 0) return false;
  return invite.mode === "kamikaze" ? score < invite.score : score > invite.score;
}
