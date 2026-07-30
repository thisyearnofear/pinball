/**
 * A4 world-physics coupling — deterministic gravity modifiers.
 *
 * Each world bends the table (pirate ship sways, spaceship drifts), so
 * tournament choice becomes ruleset choice. These are pure functions of
 * (worldPhysics, tickCount) only — hard rule 1: physics time is tickCount,
 * never wall clock — so a replay re-simulates identically and stays
 * verifiable. See docs/IMMERSION_SPEC.md (A4).
 */
import type { TablePhysics } from "@/definitions/game";
import { GRAVITY } from "@/definitions/game";

/**
 * Horizontal gravity component from a world's sway. A still world (no sway)
 * holds gravity.x at 0. The oscillation is keyed entirely to tickCount.
 */
export function worldGravityX(wp: TablePhysics | undefined, tickCount: number): number {
    if (!wp?.sway) return 0;
    return Math.sin((2 * Math.PI * tickCount) / wp.sway.periodTicks) * wp.sway.amplitude;
}

/**
 * Vertical gravity component scaled by the world (e.g. spaceship low-g).
 * Defaults to the table's GRAVITY when the world doesn't bend it.
 */
export function worldGravityY(wp: TablePhysics | undefined): number {
    return GRAVITY * (wp?.gravityScale ?? 1);
}
