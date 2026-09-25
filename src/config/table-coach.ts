import type { GameMode } from "@/config/tournaments";
import { CHAPTERS, type ChapterConfig } from "@/model/chapters";

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

/**
 * What the table has seen the player do so far. Monotonic, first run only:
 * observations only ever turn on (or count up), never off, so a cue that has
 * fired once cannot re-fire on a later sample of the same state.
 */
export type CoachObservations = {
  /** The player has touched the table at least once. */
  engaged: boolean;
  /** The player has performed a deliberate DIVE. */
  dived: boolean;
  /** The player has paid the table's time tax (bumper / trigger group). */
  taxed: boolean;
  // ── Story mode (any chapter — copy comes from the chapter config) ─
  /** The ball has been captured at the shrine (lesson/blessing phase seen). */
  captured: boolean;
  /** The player holds the water blessing. */
  learned: boolean;
  /** The player has armed Water at least once — the arm verb is proven. */
  armed: boolean;
  /** How many fire seals have been quenched so far (0–2). */
  sealsQuenched: number;
  /** Both seals quenched — the torii passage is open. */
  gateOpen: boolean;
  /** The chapter has been won. */
  won: boolean;
  /** The player last lost integrity to an unarmed burning seal. */
  burned: boolean;
  /** The player last lost integrity to the drain. */
  drained: boolean;
  /** The player answered a drain with a deliberate (charged) save. */
  saved: boolean;
};

export function noObservations(): CoachObservations {
  return {
    engaged: false,
    dived: false,
    taxed: false,
    captured: false,
    learned: false,
    armed: false,
    sealsQuenched: 0,
    gateOpen: false,
    won: false,
    burned: false,
    drained: false,
    saved: false,
  };
}

export type CoachCueId =
  | "inversion"
  | "dive"
  | "tax"
  | "flippers"
  | "bump"
  | "shrine"
  | "burn"
  | "drain"
  | "finish";

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
/**
 * The standing verb card, shared by classic and story. In story it retires
 * itself once the player has armed Water — by then the shrine trial and the
 * contextual callouts own the teaching, and a permanent card would only sit
 * between the player and the playfield.
 */
const FLIPPERS_CARD = (touchscreen: boolean, armName = "Water"): CoachCue => ({
  id: "flippers",
  kanji: "◀▶",
  lines: [
    "Tap either side of the table to work that flipper.",
    touchscreen
      ? `Tap to launch or guide — swipe up to arm ${armName}.`
      : "Space to launch or guide — a charged hold nudges a live ball.",
  ],
  anchor: "center",
  autoDismissSec: 9,
  priority: RULE_PRIORITY,
  shows: () => true,
  satisfied: () => false,
});

export function coachScript(
  mode: GameMode | "story" | undefined,
  touchscreen: boolean,
  chapter: ChapterConfig = CHAPTERS["water-shrine"],
): CoachCue[] {
  if (mode === "story") {
    return [
      { ...FLIPPERS_CARD(touchscreen, chapter.verb.name), satisfied: (obs) => obs.armed },
      {
        id: "shrine",
        kanji: chapter.glyph,
        lines: [
          chapter.coach.shrineLine,
          "Your first mistake there is free; the main ball waits, safely held.",
        ],
        anchor: "bottom",
        autoDismissSec: 7,
        priority: CONTEXT_PRIORITY,
        shows: (obs) => obs.captured,
        satisfied: (obs) => obs.learned,
      },
      {
        id: "burn",
        kanji: chapter.markers.sealHotGlyph,
        lines: [
          chapter.coach.burnLine,
          touchscreen
            ? `Swipe up to arm ${chapter.verb.name}, then strike it.`
            : `Press ${chapter.verb.key} to arm ${chapter.verb.name}, then strike it.`,
        ],
        anchor: "bottom",
        autoDismissSec: 7,
        priority: CONTEXT_PRIORITY,
        // Only at the moment it hurts — the same principle as the tax cue.
        shows: (obs) => obs.burned,
        // If the player has since armed and quenched, the lesson landed.
        satisfied: (obs) => obs.armed && obs.sealsQuenched >= 1,
      },
      {
        id: "drain",
        kanji: "落",
        lines: [
          "The drain costs integrity. Hold to launch — and once the ball is live, a charged hold nudges it clear.",
          ...(touchscreen ? [] : ["Hold SPACE to launch; SPACE again charges an aimed save."]),
        ],
        anchor: "bottom",
        autoDismissSec: 7,
        priority: CONTEXT_PRIORITY,
        shows: (obs) => obs.drained,
        // A deliberate save after the fall is proof the counter-play landed.
        satisfied: (obs) => obs.saved,
      },
      {
        id: "finish",
        kanji: chapter.markers.gateOpenLabel.split(" ")[0],
        lines: [chapter.coach.finishLine],
        anchor: "center",
        autoDismissSec: 8,
        priority: CONTEXT_PRIORITY,
        shows: (obs) => obs.gateOpen,
        satisfied: (obs) => obs.won,
      },
    ];
  }
  if (mode !== "kamikaze") {
    return [FLIPPERS_CARD(touchscreen)];
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
    touchscreen
      ? "HOLD to charge a power nudge (up to 3×) — an aim line shows the direction."
      : "HOLD the pointer to charge a power nudge (up to 3×) — the aim line shows the direction. SPACE charges the same nudge, aimed up-table.",
    touchscreen ? "DOUBLE-TAP to deploy a banked munition." : "Press D (or double-click) to deploy a banked munition.",
    touchscreen ? "SWIPE UP to TILT-LOCK; the underworld meter fills as you play." : "Press SHIFT (or drag up) to TILT-LOCK; the underworld meter fills as you play.",
  ];
}
