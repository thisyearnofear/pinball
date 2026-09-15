import type { GameMode } from "@/config/tournaments";

/**
 * Everything the game *teaches on the first run*.
 *
 * There are no intro slides: a run lasts about four seconds, so a screen the
 * player has to page through before playing spends the whole teaching budget
 * before the game has started. Instead the teaching plays **on the table**,
 * while the ball is moving, and only where it applies:
 *
 *  - `coachScript()` — the cues. Each declares *when* it is worth showing
 *    (`shows`), *what makes it redundant* (`satisfied`) and how long it may
 *    stay up on its own. The cues are selected from observations rather than
 *    from an event stream, so the outcome is the same no matter what order the
 *    player does things in.
 *  - `extraControlLines()` — the exhaustive secondary verbs. Those belong in
 *    the reference (How to Play), never in the critical path.
 */

/** What the table has seen the player do so far. Monotonic, first run only. */
export type CoachObservations = {
  /** The player has touched the table at least once. */
  engaged: boolean;
  /** The player has performed a deliberate DIVE. */
  dived: boolean;
  /** The player has paid the table's time tax (bumper / trigger group). */
  taxed: boolean;
};

export function noObservations(): CoachObservations {
  return { engaged: false, dived: false, taxed: false };
}

export type CoachCueId = "inversion" | "dive" | "tax" | "flippers" | "bump";

/**
 * Where on the playfield the cue is anchored. The rule lands dead centre;
 * callouts drop to the bottom, clear of the HUD (top-left) and the power-up
 * bar (top-right) so a tip never covers the readout it is talking about.
 */
export type CoachAnchor = "center" | "bottom";

export type CoachCue = {
  id: CoachCueId;
  /** Kanji mark. Decorative — the lines carry the meaning. */
  kanji: string;
  lines: string[];
  anchor: CoachAnchor;
  /** Seconds the cue may stay up on its own if the player does nothing. */
  autoDismissSec: number;
  /** Contextual cues outrank the standing rule and interrupt it. */
  priority: number;
  /** Whether this cue is worth showing yet. */
  shows: (obs: CoachObservations) => boolean;
  /** Once true, the cue is redundant and is never shown again. */
  satisfied: (obs: CoachObservations) => boolean;
};

const RULE_PRIORITY = 0;
const CONTEXT_PRIORITY = 10;

/**
 * The first-run script. Deliberately one standing card (the rule + the verb
 * that wins) plus contextual callouts that fire when the player meets them —
 * never a carousel.
 */
export function coachScript(mode: GameMode | undefined, touchscreen: boolean): CoachCue[] {
  if (mode !== "kamikaze") {
    return [
      {
        id: "flippers",
        kanji: "◀▶",
        lines: [
          "Tap either side of the table to work that flipper.",
          touchscreen ? "Swipe up to bump the table — powerful, so don't spam it." : "Press space to bump — powerful, so don't spam it.",
        ],
        anchor: "center",
        autoDismissSec: 9,
        priority: RULE_PRIORITY,
        shows: () => true,
        satisfied: () => false,
      },
    ];
  }

  return [
    {
      id: "inversion",
      kanji: "神風",
      lines: [
        "MAMORU fights to SAVE the ball — you win by DRAINING it. Fastest drain wins.",
        touchscreen
          ? "SWIPE DOWN to DIVE: a deliberate drain the machine can't save."
          : "Press ↓ (or drag down) to DIVE: a deliberate drain the machine can't save.",
      ],
      anchor: "center",
      autoDismissSec: 9,
      priority: RULE_PRIORITY,
      shows: () => true,
      // Diving is proof the rule landed; there is nothing left to teach.
      satisfied: (obs) => obs.dived,
    },
    {
      id: "tax",
      kanji: "時",
      lines: ["That cost you TIME. Bumpers and targets add a tax — the table is on MAMORU's side."],
      anchor: "bottom",
      autoDismissSec: 5,
      priority: CONTEXT_PRIORITY,
      // Only worth saying at the moment it happens: it explains a hit the
      // player just took, rather than warning them about a hypothetical.
      shows: (obs) => obs.taxed,
      satisfied: () => false,
    },
  ];
}

/**
 * The cue to render right now, or null when the first run has nothing left to
 * say. Priority, not script order, decides which one wins: the standing rule
 * sits at the bottom and a contextual callout interrupts it for the few
 * seconds it is relevant, then hands the table back.
 */
export function currentCue(
  script: CoachCue[],
  obs: CoachObservations,
  dismissed: ReadonlySet<string> = new Set<string>(),
): CoachCue | null {
  let best: CoachCue | null = null;
  for (const cue of script) {
    if (cue.satisfied(obs) || dismissed.has(cue.id)) continue;
    if (!cue.shows(obs)) continue;
    if (!best || cue.priority > best.priority) best = cue;
  }
  return best;
}

/** Secondary verbs, behind the reference — never in the critical path. */
export function extraControlLines(mode: GameMode | undefined, touchscreen: boolean): string[] {
  if (mode !== "kamikaze") return [];
  return [
    "HOLD to charge a power nudge (up to 3×) — an aim line shows the direction.",
    touchscreen ? "DOUBLE-TAP to deploy a banked munition." : "Press D (or double-click) to deploy a banked munition.",
    touchscreen ? "SWIPE UP to TILT-LOCK; the underworld meter fills as you play." : "Press SHIFT (or drag up) to TILT-LOCK; the underworld meter fills as you play.",
  ];
}
