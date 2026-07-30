/**
 * Shot-calling control — the serve-based duel that replaces continuous nudging.
 *
 * Reframe: don't control the moving ball — control the next shot. The ball is
 * held; the player calls a shot; MAMORU contests; a release launches it; physics
 * resolves; the drain is a telegraphed, deterministic contest (no hidden roll).
 *
 * Two isolated variants so each skill can be tested alone:
 *   - feint:      outsmart MAMORU's reaction. Full accuracy, no meter. The guard
 *                 reacts to your aim after a human-scale delay; feint to draw it
 *                 off, then release the open lane before it catches up.
 *   - precision:  call + execute. MAMORU pre-commits a lane (shown); you pick the
 *                 open lane and nail a timing meter. Accuracy is a SIGNED,
 *                 deterministic error — release left of center drifts left, right
 *                 drifts right — so input → error → outcome is learnable.
 *
 * The duel starts on the player's FIRST aim: no lane, guard, or meter exists
 * before intent is expressed. Everything is pure and derived from
 * (tickCount, seed) only — hard rule 1 — so replays re-simulate identically.
 */
import { IMMERSION } from "@/config/immersion-tuning";

export const TICKS_PER_SECOND = 60;

export type ShotVariant = "feint" | "precision";
export type ShotPhase = "aiming" | "released" | "resolving" | "drained" | "saved";

export type ShotState = {
    variant: ShotVariant;
    phase: ShotPhase;
    lanes: number;
    /** Player's intended lane; null until the first aim (neutral start). */
    aimedLane: number | null;
    /** Tick of the latest aim/feint signal. */
    aimSignalTick: number;
    /** Lane the machine was committed to before the latest feint (feint memory). */
    prevGuardLane: number | null;
    /** Tick the timing meter started (first aim); null before. Precision only. */
    meterStartTick: number | null;
    /** Difficulty reaction time, in ticks (feint variant). */
    reactionTicks: number;
    /** Precision: the lane MAMORU pre-committed to at serve (fixed, visible). */
    precommittedGuard: number | null;
    /** Feint: the first (bait) lane, and the tick it was signalled. The break
     *  must come after MAMORU commits to the bait, or the feint is meaningless. */
    baitLane: number | null;
    baitSignalTick: number;
    releaseTick: number | null;
    accuracy: number;
    /** Signed meter offset at release (-0.5..0.5); drives the directional miss. */
    releaseOffset: number;
    serveCount: number;
    rallyStartTick: number;
};

export function reactionMsToTicks(ms: number): number {
    return (ms / 1000) * TICKS_PER_SECOND;
}

export function createShotState(
    variant: ShotVariant, lanes: number, reactionMs: number, startTick: number, precommittedGuard: number | null = null
): ShotState {
    return {
        variant,
        phase: "aiming",
        lanes,
        aimedLane: null,
        aimSignalTick: startTick,
        prevGuardLane: null,
        meterStartTick: null,
        reactionTicks: reactionMsToTicks(reactionMs),
        precommittedGuard: variant === "precision" ? precommittedGuard : null,
        baitLane: null,
        baitSignalTick: startTick,
        releaseTick: null,
        accuracy: 0,
        releaseOffset: 0,
        serveCount: 0,
        rallyStartTick: startTick,
    };
}

/** Begin a fresh serve (ball returned to the plunger). Neutral start: no aim,
 *  no meter, until the player acts. Precision gets a new pre-committed guard. */
export function beginServe(state: ShotState, tick: number, precommittedGuard: number | null = null): ShotState {
    return {
        ...state,
        phase: "aiming",
        aimedLane: null,
        aimSignalTick: tick,
        prevGuardLane: null,
        meterStartTick: null,
        precommittedGuard: state.variant === "precision" ? precommittedGuard : state.precommittedGuard,
        baitLane: null,
        baitSignalTick: tick,
        releaseTick: null,
        accuracy: 0,
        releaseOffset: 0,
        serveCount: state.serveCount + 1,
    };
}

function clampLane(lane: number, lanes: number): number {
    return Math.max(0, Math.min(lanes - 1, Math.round(lane)));
}

/**
 * The lane MAMORU is guarding at a tick.
 *  - precision: the pre-committed lane, fixed and visible from serve start.
 *  - feint: the machine catches up to the player's aim after its reaction
 *    delay; until then it stays on the previous lane. Null before the first
 *    aim (the duel hasn't started). THIS is the feint mechanic.
 */
export function guardLaneAt(state: ShotState, tick: number): number | null {
    if (state.variant === "precision") return state.precommittedGuard;
    if (state.aimedLane === null) return null;
    if (tick >= state.aimSignalTick + state.reactionTicks) return state.aimedLane;
    return state.prevGuardLane;
}

/** Player signals (or feints to) a lane. The first aim starts the duel: it
 *  begins the reaction race (feint) and starts the timing meter (precision). */
export function signalAim(state: ShotState, lane: number, tick: number): ShotState {
    const next = clampLane(lane, state.lanes);
    const firstAim = state.aimedLane === null;
    if (!firstAim && next === state.aimedLane) return state; // no-op if unchanged
    return {
        ...state,
        prevGuardLane: firstAim ? null : guardLaneAt(state, tick),
        aimedLane: next,
        aimSignalTick: tick,
        meterStartTick: firstAim ? tick : state.meterStartTick,
        // Feint: the first aim is the bait; later switches are the break.
        baitLane: firstAim ? next : state.baitLane,
        baitSignalTick: firstAim ? tick : state.baitSignalTick,
    };
}

/**
 * Whether the player may release. Variant-specific so each tests its intended
 * skill:
 *  - feint: FIRE is locked until MAMORU commits to the bait (no quick-draw).
 *    After commit the player may fire — but firing into the guarded bait lane
 *    (never switching) is a save, so the feint (switch, then fire during the
 *    recovery window) is required to win.
 *  - precision: fire any time after a lane is called; the meter sets precision.
 */
export function canRelease(state: ShotState, tick: number): boolean {
    if (state.phase !== "aiming" || state.aimedLane === null) return false;
    if (state.variant === "precision") return true;
    return state.baitLane !== null && tick >= state.baitSignalTick + state.reactionTicks;
}

export type FeintStage = "idle" | "baiting" | "break";

/** Feint sub-phase for the HUD: idle (no lane) -> baiting (wait for commit) ->
 *  break (committed; switch + fire). */
export function feintStage(state: ShotState, tick: number): FeintStage {
    if (state.variant !== "feint" || state.aimedLane === null || state.baitLane === null) return "idle";
    return tick >= state.baitSignalTick + state.reactionTicks ? "break" : "baiting";
}

/** Timing-meter marker position (0..1 triangle wave). Precision only; 0 before
 *  the meter starts. The peak (0.5) is the sweet spot, crossed twice per cycle. */
export function meterPosition(state: ShotState, tick: number): number {
    if (state.variant !== "precision" || state.meterStartTick === null) return 0;
    const ticksPerCycle = TICKS_PER_SECOND / IMMERSION.shotCalling.meterSpeed;
    const phase = (((tick - state.meterStartTick) % ticksPerCycle) + ticksPerCycle) % ticksPerCycle / ticksPerCycle;
    return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

/** Accuracy (0..1) for a marker position: 1 at center (0.5), falling linearly to
 *  0 at the sweet-spot edge. */
export function accuracyForPosition(position: number): number {
    const dist = Math.abs(position - 0.5);
    return Math.max(0, Math.min(1, 1 - dist / IMMERSION.shotCalling.meterSweetSpot));
}

/**
 * Launch velocity for an intended lane. Deterministic and legible:
 *  - lateral bias aims the shot at the called lane;
 *  - `offset` (signed meter deviation) pushes the miss left (offset < 0) or
 *    right (offset > 0), proportional to distance from center;
 *  - accuracy scales power (off-center releases hit weaker).
 * No randomness: the same release always produces the same shot, so the player
 * can learn "I released right of center, so I pushed it right."
 */
export function launchVector(
    lane: number, lanes: number, accuracy: number, offset: number, baseSpeed: number
): { x: number; y: number } {
    const t = IMMERSION.shotCalling;
    const bias = lanes > 1 ? (lane / (lanes - 1)) * 2 - 1 : 0; // -1 (left) .. +1 (right)
    const angleError = offset * 2 * t.maxAngleError; // signed, proportional to offset
    const power = 1 - t.maxPowerLoss * (1 - accuracy); // off-center = weaker
    return {
        x: (bias * t.lateralStrength + angleError) * baseSpeed,
        y: -baseSpeed * power, // negative y = up the table
    };
}

/** Resolve a release. Feint = full accuracy, no error. Precision = accuracy and
 *  a signed directional error from the meter position at the release tick. */
export function resolveRelease(
    state: ShotState, releaseTick: number, baseSpeed: number
): { accuracy: number; offset: number; launch: { x: number; y: number } } {
    if (state.variant === "feint" || state.aimedLane === null) {
        const lane = state.aimedLane ?? 0;
        return { accuracy: 1, offset: 0, launch: launchVector(lane, state.lanes, 1, 0, baseSpeed) };
    }
    const position = meterPosition(state, releaseTick);
    const accuracy = accuracyForPosition(position);
    const offset = position - 0.5; // signed: <0 left, >0 right
    return { accuracy, offset, launch: launchVector(state.aimedLane, state.lanes, accuracy, offset, baseSpeed) };
}

/** Map a ball x-position to a lane index (drain landing detection). */
export function laneForX(x: number, tableWidth: number, lanes: number): number {
    const frac = Math.max(0, Math.min(1, x / tableWidth));
    return Math.min(lanes - 1, Math.floor(frac * lanes));
}

/**
 * Deterministic, telegraphed drain resolution — no hidden coin flip. If the
 * ball lands in the lane MAMORU guards, it saves; otherwise it drains.
 * Randomness lives earlier (none, now — the launch is deterministic); the
 * decisive moment is readable.
 */
export function resolveDrain(landingLane: number, coveredLane: number | null): "save" | "drain" {
    if (coveredLane !== null && landingLane === coveredLane) return "save";
    return "drain";
}
