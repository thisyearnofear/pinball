/**
 * Shot-calling control — the serve-based duel that replaces continuous nudging.
 *
 * Design (docs/GDD.md "Shot-calling control"): the player does NOT steer the
 * moving ball. Instead, at each serve the ball is held, the player signals a
 * target lane, MAMORU races to guard it (its reaction time now a VISIBLE
 * contest), and the player releases through a timing window. Accuracy sets the
 * launch error envelope; physics resolves the shot; the drain is a telegraphed,
 * deterministic contest (no hidden coin flip).
 *
 * Core tension: aim duration trades precision against contest — hold to refine
 * the shot, but the machine closes your lane; release early to beat it.
 *
 * Everything here is pure and derived from (tickCount, seed) only — hard rule 1
 * — so a replay re-simulates identically. Wall clock never enters.
 */
import { IMMERSION } from "@/config/immersion-tuning";

export const TICKS_PER_SECOND = 60;

export type ShotPhase = "aiming" | "released" | "resolving" | "drained" | "saved";

export type ShotState = {
    phase: ShotPhase;
    lanes: number;
    /** Player's current intended lane. */
    aimedLane: number;
    /** Tick of the latest aim/feint signal. */
    aimSignalTick: number;
    /** Lane the machine was committed to before the latest feint (contest memory). */
    prevGuardLane: number | null;
    /** Tick this serve's timing meter started. */
    meterStartTick: number;
    /** Difficulty reaction time, in ticks. */
    reactionTicks: number;
    releaseTick: number | null;
    accuracy: number;
    serveCount: number;
    /** Tick the current rally began (drives the save charge). */
    rallyStartTick: number;
};

export function reactionMsToTicks(ms: number): number {
    return (ms / 1000) * TICKS_PER_SECOND;
}

export function createShotState(lanes: number, reactionMs: number, startTick: number): ShotState {
    return {
        phase: "aiming",
        lanes,
        aimedLane: 0,
        aimSignalTick: startTick,
        prevGuardLane: null,
        meterStartTick: startTick,
        reactionTicks: reactionMsToTicks(reactionMs),
        releaseTick: null,
        accuracy: 0,
        serveCount: 0,
        rallyStartTick: startTick,
    };
}

/** Begin a fresh serve (ball returned to the plunger). Preserves rally start +
 *  serve count; resets aim, meter, and release. */
export function beginServe(state: ShotState, tick: number): ShotState {
    return {
        ...state,
        phase: "aiming",
        aimedLane: 0,
        aimSignalTick: tick,
        prevGuardLane: null,
        meterStartTick: tick,
        releaseTick: null,
        accuracy: 0,
        serveCount: state.serveCount + 1,
    };
}

function clampLane(lane: number, lanes: number): number {
    return Math.max(0, Math.min(lanes - 1, Math.round(lane)));
}

/**
 * The lane MAMORU is guarding at a tick. The machine catches up to the player's
 * aim only after its reaction delay; until then it stays committed to the
 * previous lane. THIS is the feint mechanic: switch lanes after the machine has
 * committed and it keeps guarding the old lane for `reactionTicks`, opening the
 * new one. Pure + tick-derived.
 */
export function guardLaneAt(state: ShotState, tick: number): number | null {
    if (tick >= state.aimSignalTick + state.reactionTicks) return state.aimedLane;
    return state.prevGuardLane;
}

/** Player signals (or feints to) a lane. Snapshots the guard's current commit so
 *  the reaction contest is reconstructible. No-op if the lane is unchanged. */
export function signalAim(state: ShotState, lane: number, tick: number): ShotState {
    const next = clampLane(lane, state.lanes);
    if (next === state.aimedLane) return state;
    return {
        ...state,
        prevGuardLane: guardLaneAt(state, tick),
        aimedLane: next,
        aimSignalTick: tick,
    };
}

/** Timing-meter marker position (0..1 triangle wave) at a tick. The peak (0.5)
 *  is the sweet spot; it is crossed twice per cycle. */
export function meterPosition(state: ShotState, tick: number): number {
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
 * Launch velocity for an intended lane at a given accuracy. Perfect accuracy is
 * a faithful shot up-the-table biased toward the lane; poor accuracy scatters
 * angle and power. The seeded rng drives the scatter, so it is verifiable.
 */
export function launchVector(
    lane: number, lanes: number, accuracy: number, baseSpeed: number, rng: () => number
): { x: number; y: number } {
    const t = IMMERSION.shotCalling;
    const bias = lanes > 1 ? (lane / (lanes - 1)) * 2 - 1 : 0; // -1 (left) .. +1 (right)
    const errorScale = 1 - accuracy;
    const angleError = (rng() - 0.5) * 2 * t.maxAngleError * errorScale;
    const powerError = 1 + (rng() - 0.5) * 2 * t.maxPowerError * errorScale;
    return {
        x: (bias * t.lateralStrength + angleError) * baseSpeed,
        y: -baseSpeed * powerError, // negative y = up the table
    };
}

/** Resolve a release: accuracy from the meter, then the launch vector. */
export function resolveRelease(
    state: ShotState, releaseTick: number, baseSpeed: number, rng: () => number
): { accuracy: number; launch: { x: number; y: number } } {
    const accuracy = accuracyForPosition(meterPosition(state, releaseTick));
    return { accuracy, launch: launchVector(state.aimedLane, state.lanes, accuracy, baseSpeed, rng) };
}

/** Save charge fraction (0..1): how armed the machine's save is over the rally. */
export function saveChargeFraction(state: ShotState, tick: number): number {
    const elapsedMs = ((tick - state.rallyStartTick) / TICKS_PER_SECOND) * 1000;
    return Math.max(0, Math.min(1, elapsedMs / IMMERSION.shotCalling.saveChargeMs));
}

/** Map a ball x-position to a lane index (drain landing detection). */
export function laneForX(x: number, tableWidth: number, lanes: number): number {
    const frac = Math.max(0, Math.min(1, x / tableWidth));
    return Math.min(lanes - 1, Math.floor(frac * lanes));
}

/**
 * Deterministic, telegraphed drain resolution — no hidden coin flip. If the
 * machine's save is armed AND the ball lands in the lane it is guarding, it
 * saves; otherwise the ball drains. Randomness lives earlier (the launch
 * scatter); the decisive moment is readable.
 */
export function resolveDrain(
    landingLane: number, coveredLane: number | null, saveReady: boolean
): "save" | "drain" {
    if (saveReady && coveredLane !== null && landingLane === coveredLane) return "save";
    return "drain";
}
