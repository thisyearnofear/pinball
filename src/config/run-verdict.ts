/**
 * Run verdict — a single expressive, earned grade for a finished run.
 *
 * Delight goal: turn "run complete" into a moment with personality that reacts
 * to how well the player actually did, in the Kamikaze Ball voice (wind /
 * blossom / machine). Pure and deterministic: given the same run inputs it
 * returns the same verdict, so it's trivially testable and needs no backend.
 *
 * Grade is derived from a normalized performance ratio against a per-difficulty
 * "great" target (par). Kamikaze rewards a faster drain (lower is better);
 * classic rewards a higher score. Pars and tier thresholds are calibrated
 * against the bot harness (tests/sim/shot-calling-skill.sim.ts): a null
 * (do-nothing) player must not reach S/A, and only skilled play does.
 */

export type VerdictDifficulty = "easy" | "medium" | "hard";

export type RunVerdict = {
  grade: "S" | "A" | "B" | "C" | "D";
  /** Single-kanji stamp that matches the grade's mood. */
  kanji: string;
  /** Short poetic line shown to the player. */
  line: string;
  /** Performance ratio (actual / par); >=1 beat the target. */
  ratio: number;
};

// "Great" target drain time (ms) per difficulty. Lower drain = better, and a
// tougher machine keeps the ball alive longer, so a great time is higher on
// hard. Calibrated against the bot harness: a null (do-nothing) player drains
// in ~7s on easy and ~16s on medium. Pars are set so that passive play lands
// C/B and only skilled play reaches A/S. The S tier requires beating par by
// 40%+ — fast enough that the machine's defenses were genuinely outplayed.
const KAMIKAZE_PAR_MS: Record<VerdictDifficulty, number> = {
  easy: 2500,
  medium: 5000,
  hard: 9000,
};

// "Great" target score for classic pinball. perf = score / par.
const CLASSIC_PAR_SCORE: Record<VerdictDifficulty, number> = {
  easy: 40000,
  medium: 55000,
  hard: 55000,
};

type VerdictText = { grade: RunVerdict["grade"]; kanji: string };

// Shared grade tiers + kanji stamp by performance ratio. S requires beating
// par by 80%+ (ratio ≥ 1.8) so only genuinely skillful drains reach divine.
const TIERS: { min: number; grade: RunVerdict["grade"]; kanji: string }[] = [
  { min: 1.8, grade: "S", kanji: "神" }, // kami — transcendent
  { min: 1.2, grade: "A", kanji: "風" }, // kaze — the wind itself
  { min: 0.8, grade: "B", kanji: "波" }, // nami — a strong wave
  { min: 0.5, grade: "C", kanji: "芽" }, // me — a promising sprout
  { min: 0, grade: "D", kanji: "石" }, // ishi — stone, still learning
];

const KAMIKAZE_LINES: Record<RunVerdict["grade"], string> = {
  S: "Divine wind — the blossom fell as if it chose to.",
  A: "A clean fall. The machine never saw it coming.",
  B: "A worthy drift. The wind is on your side.",
  C: "The blossom lingered. Sharpen your timing.",
  D: "The machine held firm. The wind will return.",
};

const CLASSIC_LINES: Record<RunVerdict["grade"], string> = {
  S: "A legendary run — the table bows to you.",
  A: "Masterful. Every bumper feared you.",
  B: "A strong, steady score.",
  C: "A promising start. Chase the combos.",
  D: "Warm-up round. The table awaits a rematch.",
};

function tierFor(ratio: number): VerdictText {
  for (const t of TIERS) {
    if (ratio >= t.min) return { grade: t.grade, kanji: t.kanji };
  }
  return { grade: "D", kanji: "石" };
}

/**
 * Compute the verdict for a run.
 * @param kamikaze  true = drain-time mode (lower score better)
 * @param score     kamikaze drain time in ms, or classic points
 * @param difficulty machine difficulty (affects the par target)
 */
export function getRunVerdict(
  kamikaze: boolean,
  score: number,
  difficulty: VerdictDifficulty = "medium"
): RunVerdict {
  const safe = Math.max(1, score);
  let ratio: number;
  if (kamikaze) {
    ratio = KAMIKAZE_PAR_MS[difficulty] / safe; // faster drain → higher ratio
  } else {
    ratio = safe / CLASSIC_PAR_SCORE[difficulty]; // higher score → higher ratio
  }
  // Clamp so extreme inputs don't distort the display, but keep ordering.
  const clamped = Math.max(0, Math.min(3, ratio));
  const tier = tierFor(clamped);
  const line = (kamikaze ? KAMIKAZE_LINES : CLASSIC_LINES)[tier.grade];
  return { grade: tier.grade, kanji: tier.kanji, line, ratio: Math.round(ratio * 100) / 100 };
}
