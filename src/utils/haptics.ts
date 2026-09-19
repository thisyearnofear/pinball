import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_HAPTICS_ENABLED } from "@/definitions/settings";

/**
 * Haptic feedback, ranked.
 *
 * Two properties of the Vibration API shape everything here:
 *
 *   1. **It does not queue.** "If a vibration pattern is already in progress
 *      when this method is called, the previous pattern is halted and the new
 *      one begins instead" (MDN). Fire-and-forget patterns therefore fight each
 *      other: a 15 ms flipper tap landing during the 190 ms drain fanfare cuts
 *      the game's biggest moment short, and a bumper run overrides itself every
 *      35 ms until it reads as one continuous buzz.
 *   2. **iOS Safari does not implement it at all**, so on an iPhone every call
 *      is a no-op. `isSupported()` exists so the settings screen can say that
 *      plainly instead of offering a switch that does nothing.
 *
 * So each event carries a rank, a gap, and — for the moments worth protecting —
 * a hold:
 *
 *   - the same event cannot re-fire inside its `gap`, which is what keeps
 *     texture (flippers, bumper hits) legible as separate taps;
 *   - a higher rank always plays, and may legitimately cut a lower one short;
 *   - a lower rank is **dropped, never queued**, while a higher-ranked `hold`
 *     is still ringing out.
 *
 * Ranks: 0 texture, 1 player verb, 2 machine beat, 3 the run's ceremony.
 */

export type HapticPattern = number | number[];

/** `neutral` is for a release with no meter to judge (feint). */
export type ShotReleaseQuality = "perfect" | "good" | "poor" | "neutral";

type HapticEvent = {
  pattern: HapticPattern;
  rank: number;
  /** Minimum ms before this same event may fire again. */
  gap: number;
  /** ms for which lower-ranked events are dropped after this one fires. */
  hold?: number;
  /**
   * Weight of the visual echo (utils/screen-pulse), 1 subtle or 2 strong.
   * Omitted where an echo would be noise: a flipper already animates, and at a
   * 45ms gap is the one event frequent enough to strobe.
   */
  visual?: 1 | 2;
};

/**
 * Full charge is 3x. Deliberately a local constant rather than an import from
 * the input controller: the model imports this module too, and must not drag
 * DOM event listeners into its import graph. `haptics.spec.ts` pins the two
 * constants together so they cannot drift.
 */
export const MAX_CHARGE_POWER = 3;

const FLIP: HapticEvent = { pattern: 15, rank: 0, gap: 45 };
const BUMP: HapticEvent = { pattern: 35, rank: 1, gap: 90, visual: 1 };
const NUDGE: HapticEvent = { pattern: 22, rank: 1, gap: 60, visual: 1 };
const POWER_UP: HapticEvent = { pattern: [15, 30, 15], rank: 2, gap: 200, hold: 90, visual: 2 };
/** MAMORU reading your lane and taking the ball away. Hits harder than a nudge. */
const AI_SAVE: HapticEvent = { pattern: 25, rank: 2, gap: 150, hold: 80, visual: 2 };
const DRAIN_VICTORY: HapticEvent = { pattern: [40, 60, 90], rank: 3, gap: 400, hold: 200, visual: 2 };
const TILT_DENIED: HapticEvent = { pattern: [20, 40, 20], rank: 1, gap: 400, visual: 1 };
/** The table gave up on you. The one buzz in the game that ends a round. */
const TILT: HapticEvent = { pattern: [50, 60, 140], rank: 2, gap: 800, hold: 220, visual: 2 };

/** One short buzz per charge notch, deepening as the charge builds. */
const chargeTickPattern = (notch: number): HapticEvent => ({
  pattern: 4 + notch * 4,
  rank: 0,
  gap: 40,
  // Echoed even though it is texture-ranked: on a device with no motor this is
  // the only way to feel the notch you just crossed.
  visual: 1,
});

/**
 * A held nudge lands with weight proportional to the charge: 1x is a tap, 3x is
 * a shove. The floor is NUDGE's own length, so a release at 1x is honestly the
 * same event as a tap and the gradient only ever grows from there. Clamped
 * rather than extrapolated, so an out-of-range power cannot produce a pattern
 * the hardware will refuse.
 */
const chargeReleasePattern = (power: number): HapticEvent => {
  const clamped = Math.max(1, Math.min(MAX_CHARGE_POWER, power));
  const fraction = (clamped - 1) / (MAX_CHARGE_POWER - 1);
  return {
    pattern: Math.round(22 + fraction * 30),
    rank: 1,
    gap: 120,
    // A shove flashes; a tap only confirms.
    visual: fraction >= 0.6 ? 2 : 1,
  };
};

/** Escalating: each bump that brings the tilt closer lands harder. */
const tiltWarningPattern = (level: number): HapticEvent => {
  const pulses = Math.max(1, Math.min(3, level));
  const pattern: number[] = [];
  for (let i = 0; i < pulses; i += 1) pattern.push(16, 28);
  pattern.push(30);
  return { pattern, rank: 1, gap: 150, visual: level >= 3 ? 2 : 1 };
};

const SHOT_RELEASE: Record<ShotReleaseQuality, HapticEvent> = {
  // Timing is the entire skill in precision, so the verdict is felt at release:
  // two confirming taps and a landing. Protected, because it is the player's
  // own skill being reported back to them.
  perfect: { pattern: [18, 26, 42], rank: 2, gap: 250, hold: 130, visual: 2 },
  good: { pattern: 24, rank: 1, gap: 150, visual: 1 },
  // A miss gets a shape rather than a thud: buzz, pause, buzz.
  poor: { pattern: [12, 34, 12], rank: 1, gap: 150, visual: 1 },
  neutral: { pattern: 16, rank: 1, gap: 120, visual: 1 },
};

/**
 * Story-mode events. Same contract as the arcade verbs: a distinct shape per
 * moment, felt once and understood. Story otherwise shares every generic
 * pattern (flip/bump/nudge/charge) through the shared gesture layer.
 */
const STORY_CAPTURE: HapticEvent = { pattern: [10, 40, 10], rank: 1, gap: 400, visual: 1 };
const STORY_ARM: HapticEvent = { pattern: [14, 30, 26], rank: 2, gap: 200, visual: 1 };
const STORY_SEAL: HapticEvent = { pattern: [30, 40, 50], rank: 2, gap: 400, hold: 120, visual: 2 };
const STORY_GATE: HapticEvent = { pattern: [12, 36, 18, 36, 60], rank: 3, gap: 600, hold: 160, visual: 2 };

export function createHaptics(options: {
  /** `null` models a device without the API (iOS Safari). */
  vibrate: ((pattern: HapticPattern) => void) | null;
  enabled?: boolean;
  now?: () => number;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const now =
    options.now ??
    (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  let enabled = options.enabled ?? true;
  let lastFiredAt: Record<string, number> = {};
  let holdUntil = 0;
  let holdRank = -1;
  let visualEcho: ((weight: number) => void) | null = null;

  function fire(name: string, event: HapticEvent): boolean {
    // Two channels, one vocabulary — and they are not the same channel. A device
    // with no vibration motor still gets the visual echo, and muting haptics
    // does not mute the echo (it is gated by reduced-motion instead). So an
    // event is only dead when both channels are unavailable.
    if (!options.vibrate && !visualEcho) return false;
    const at = now();
    // A bigger beat is still ringing out: drop this rather than truncate it.
    if (at < holdUntil && event.rank < holdRank) return false;
    const last = lastFiredAt[name];
    if (last !== undefined && at - last < event.gap) return false;

    lastFiredAt[name] = at;
    if (event.hold) {
      holdUntil = at + event.hold;
      holdRank = event.rank;
    }
    if (enabled && options.vibrate) options.vibrate(event.pattern);
    if (event.visual && visualEcho) visualEcho(event.visual);
    return true;
  }

  function cancel() {
    holdUntil = 0;
    holdRank = -1;
    // 0 (or an all-zero pattern) cancels whatever is in progress. Not gated on
    // `enabled`: muting must be able to stop a pattern already running.
    options.vibrate?.(0);
  }

  return {
    fire,
    isSupported: () => options.vibrate !== null,
    isEnabled: () => enabled,
    cancel,
    setVisualEcho(sink: ((weight: number) => void) | null) {
      visualEcho = sink;
    },
    /** Clears only if `sink` is still the registered one, so a mount tearing
     *  down late cannot silence the mount that replaced it. */
    clearVisualEcho(sink?: ((weight: number) => void) | null) {
      if (!sink || visualEcho === sink) visualEcho = null;
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) cancel();
      options.onEnabledChange?.(value);
    },
    flip: () => fire("flip", FLIP),
    bump: () => fire("bump", BUMP),
    nudge: () => fire("nudge", NUDGE),
    powerUp: () => fire("powerUp", POWER_UP),
    aiSave: () => fire("aiSave", AI_SAVE),
    drainVictory: () => fire("drainVictory", DRAIN_VICTORY),    chargeTick: (notch: number) =>
      fire("chargeTick", chargeTickPattern(notch)),
    chargeRelease: (power: number) => fire("chargeRelease", chargeReleasePattern(power)),
    tilt: () => fire("tilt", TILT),
    tiltDenied: () => fire("tiltDenied", TILT_DENIED),
    tiltWarning: (level: number) => fire("tiltWarning", tiltWarningPattern(level)),
    shotReleased: (quality: ShotReleaseQuality) => fire(`shot:${quality}`, SHOT_RELEASE[quality]),
    storyCapture: () => fire("storyCapture", STORY_CAPTURE),
    storyArm: () => fire("storyArm", STORY_ARM),
    storySeal: () => fire("storySeal", STORY_SEAL),
    storyGate: () => fire("storyGate", STORY_GATE),
  };
}

export type HapticsEngine = ReturnType<typeof createHaptics>;

const nav: any = typeof navigator === "undefined" ? null : navigator;

/** `null` on iOS Safari, where the API never shipped. */
const nativeVibrate =
  nav && typeof nav.vibrate === "function"
    ? (pattern: HapticPattern) => {
        try {
          nav.vibrate(pattern);
        } catch {
          /* some browsers throw when the page lacks user activation */
        }
      }
    : null;

const engine = createHaptics({
  vibrate: nativeVibrate,
  enabled: getFromStorage(STORED_HAPTICS_ENABLED) !== "false",
  onEnabledChange: (value) => setInStorage(STORED_HAPTICS_ENABLED, value.toString()),
});

/** True where the platform can actually vibrate; false on iOS Safari. */
export const isSupported = engine.isSupported;

export const setEnabled = (value: boolean) => engine.setEnabled(value);
export const isEnabled = () => engine.isEnabled();
export const cancel = () => engine.cancel();

/**
 * Registers the visual echo for this vocabulary. Injected by the view layer
 * rather than imported, because the model imports this module too and must not
 * pull a DOM module into its graph.
 */
export const setVisualEcho = (sink: ((weight: number) => void) | null) =>
  engine.setVisualEcho(sink);
export const clearVisualEcho = (sink?: ((weight: number) => void) | null) =>
  engine.clearVisualEcho(sink);

export const flip = () => engine.flip();
export const bump = () => engine.bump();
export const nudge = () => engine.nudge();
export const powerUp = () => engine.powerUp();
export const aiSave = () => engine.aiSave();
export const drainVictory = () => engine.drainVictory();
export const chargeTick = (notch: number) => engine.chargeTick(notch);
export const chargeRelease = (power: number) => engine.chargeRelease(power);
export const tilt = () => engine.tilt();
export const tiltDenied = () => engine.tiltDenied();
export const tiltWarning = (level: number) => engine.tiltWarning(level);
export const shotReleased = (quality: ShotReleaseQuality) => engine.shotReleased(quality);
export const storyCapture = () => engine.storyCapture();
export const storyArm = () => engine.storyArm();
export const storySeal = () => engine.storySeal();
export const storyGate = () => engine.storyGate();
