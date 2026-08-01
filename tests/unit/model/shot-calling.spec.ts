import { describe, it, expect } from "vitest";
import {
    createShotState, beginServe, signalAim, guardLaneAt, meterPosition, accuracyForPosition,
    launchVector, resolveRelease, laneForX, resolveDrain, reactionMsToTicks, canRelease, feintStage,
    TICKS_PER_SECOND,
} from "@/model/shot-calling";
import { IMMERSION } from "@/config/immersion-tuning";

const LANES = IMMERSION.shotCalling.lanes;

function feint(reactionMs = 800, startTick = 0) {
    return createShotState("feint", LANES, reactionMs, startTick);
}
function feintHold(reactionMs = 800, startTick = 0, guard = 0) {
    return createShotState("feint", LANES, reactionMs, startTick, guard, "hold");
}
function precision(reactionMs = 800, startTick = 0, guard = 0) {
    return createShotState("precision", LANES, reactionMs, startTick, guard);
}

describe("shot-calling core", () => {

    describe("neutral start (intent begins the duel)", () => {
        it("should have no aimed lane, guard, or meter before the first aim", () => {
            const f = feint();
            expect(f.aimedLane).toBeNull();
            expect(guardLaneAt(f, 100)).toBeNull();
            const p = precision();
            expect(p.aimedLane).toBeNull();
            expect(meterPosition(p, 100)).toEqual(0); // meter not running yet
        });

        it("should not react to a release before any aim", () => {
            const f = feint();
            const r = resolveRelease(f, 10, 20);
            expect(r.accuracy).toEqual(1); // falls back to a neutral full-accuracy launch
        });
    });

    describe("feint variant — the reaction race", () => {
        it("should start the reaction on the first aim", () => {
            let s = feint(800); // reactionTicks = 48
            s = signalAim(s, 0, 0);
            expect(guardLaneAt(s, 10)).toBeNull();      // not yet committed
            expect(guardLaneAt(s, 48)).toEqual(0);       // caught up
        });

        it("should leave a committed machine guarding the old lane after a feint", () => {
            let s = feint(800); // 48 ticks
            s = signalAim(s, 0, 0);
            s = signalAim(s, 1, 100); // machine committed to 0 by tick 100; feint to 1
            expect(guardLaneAt(s, 100)).toEqual(0);      // still guarding 0
            expect(guardLaneAt(s, 147)).toEqual(0);      // 100 + 48 - 1
            expect(guardLaneAt(s, 148)).toEqual(1);      // caught up to the feint
        });

        it("should launch at full accuracy with no directional error", () => {
            let s = feint(800);
            s = signalAim(s, 1, 0);
            const r = resolveRelease(s, 5, 20);
            expect(r.accuracy).toEqual(1);
            expect(r.offset).toEqual(0);
            expect(r.launch.x).toBeGreaterThan(0); // aimed right
            expect(r.launch.y).toBeLessThan(0);
        });

        it("should use human-scale reaction windows (not the old AI polling)", () => {
            expect(IMMERSION.shotCalling.reactionMs.easy).toBeGreaterThanOrEqual(500);
            expect(reactionMsToTicks(IMMERSION.shotCalling.reactionMs.easy)).toBeGreaterThan(20);
        });
    });

    describe("precision variant — call + execute", () => {
        it("should show the pre-committed guard from serve start", () => {
            const s = precision(800, 0, 1);
            expect(guardLaneAt(s, 0)).toEqual(1);
            expect(guardLaneAt(s, 1000)).toEqual(1); // fixed, never chases the aim
        });

        it("should start the meter on the first aim", () => {
            let s = precision(800, 0, 0);
            expect(meterPosition(s, 50)).toEqual(0);   // not started
            s = signalAim(s, 1, 100);
            expect(meterPosition(s, 100)).toBeCloseTo(0, 5); // starts at 0
            expect(meterPosition(s, 130)).toBeGreaterThan(0); // advancing
        });

        it("should resolve accuracy + signed offset from the meter", () => {
            let s = precision(800, 0, 0);
            s = signalAim(s, 1, 0);
            const ticksPerCycle = TICKS_PER_SECOND / IMMERSION.shotCalling.meterSpeed;
            // Marker sweeps 0->1->0; it crosses the center sweet spot (position
            // 0.5) on the rise at the quarter-cycle. With the narrow sweet spot
            // the exact tick may not land at 0.5, so accuracy is high but not
            // necessarily >0.9.
            const sweetTick = Math.round(ticksPerCycle * 0.25);
            const r = resolveRelease(s, sweetTick, 20);
            expect(r.accuracy).toBeGreaterThan(0.8);
            expect(Math.abs(r.offset)).toBeLessThan(0.15);
        });
    });

    describe("meterPosition()", () => {
        it("should be periodic", () => {
            let s = precision();
            s = signalAim(s, 0, 0);
            const ticksPerCycle = TICKS_PER_SECOND / IMMERSION.shotCalling.meterSpeed;
            expect(meterPosition(s, 7)).toBeCloseTo(meterPosition(s, 7 + ticksPerCycle), 5);
        });
    });

    describe("accuracyForPosition()", () => {
        it("should be perfect at center and floor at the sweet-spot edge", () => {
            expect(accuracyForPosition(0.5)).toEqual(1);
            expect(accuracyForPosition(0)).toEqual(0);
            expect(accuracyForPosition(1)).toEqual(0);
            const near = accuracyForPosition(0.5 + IMMERSION.shotCalling.meterSweetSpot / 2);
            expect(near).toBeGreaterThan(0);
            expect(near).toBeLessThan(1);
        });
    });

    describe("launchVector() — deterministic directional miss", () => {
        it("should aim at the called lane at full accuracy", () => {
            const left = launchVector(0, LANES, 1, 0, 20);
            const right = launchVector(LANES - 1, LANES, 1, 0, 20);
            expect(left.x).toBeLessThan(0);
            expect(right.x).toBeGreaterThan(0);
        });

        it("should push the miss left for a left-of-center release, right for right-of-center", () => {
            const center = launchVector(0, LANES, 1, 0, 20).x;
            const early = launchVector(0, LANES, 0.5, -0.4, 20).x;  // offset < 0
            const late = launchVector(0, LANES, 0.5, 0.4, 20).x;    // offset > 0
            expect(early).toBeLessThan(center);
            expect(late).toBeGreaterThan(center);
        });

        it("should be fully deterministic (no randomness)", () => {
            const a = launchVector(1, LANES, 0.4, 0.2, 20);
            const b = launchVector(1, LANES, 0.4, 0.2, 20);
            expect(a).toEqual(b);
        });

        it("should weaken power as accuracy drops", () => {
            const full = launchVector(0, LANES, 1, 0, 20).y;
            const weak = launchVector(0, LANES, 0, 0, 20).y;
            expect(Math.abs(weak)).toBeLessThan(Math.abs(full));
        });
    });

    describe("laneForX()", () => {
        it("should bucket position into lanes", () => {
            expect(laneForX(100, 800, 2)).toEqual(0);
            expect(laneForX(700, 800, 2)).toEqual(1);
            expect(laneForX(-50, 800, 2)).toEqual(0);
            expect(laneForX(9999, 800, 2)).toEqual(1);
        });
    });

    describe("resolveDrain() — the telegraphed decisive contest", () => {
        it("should save when the ball lands in the guarded lane", () => {
            expect(resolveDrain(1, 1)).toEqual("save");
        });

        it("should drain when the ball lands in an unguarded lane", () => {
            expect(resolveDrain(0, 1)).toEqual("drain");
        });

        it("should drain when nothing is covered", () => {
            expect(resolveDrain(0, null)).toEqual("drain");
        });
    });

    describe("beginServe()", () => {
        it("should reset to neutral and bump the serve count", () => {
            let s = feint();
            s = signalAim(s, 1, 30);
            s = beginServe(s, 100);
            expect(s.serveCount).toEqual(1);
            expect(s.aimedLane).toBeNull();
            expect(s.phase).toEqual("aiming");
            expect(s.meterStartTick).toBeNull();
        });

        it("should re-roll the precision guard on re-serve", () => {
            let s = precision(800, 0, 0);
            s = beginServe(s, 100, 1);
            expect(s.precommittedGuard).toEqual(1);
        });
    });

    describe("feint gating (BAIT -> BREAK)", () => {
        it("should lock FIRE until the bait commits (no quick-draw)", () => {
            let s = feint(800); // 48 ticks
            expect(canRelease(s, 0)).toBe(false);   // no lane yet
            s = signalAim(s, 0, 0);                  // bait
            expect(canRelease(s, 10)).toBe(false);   // not committed yet
            expect(canRelease(s, 48)).toBe(true);    // committed
        });

        it("should report the feint stage progression", () => {
            let s = feint(800);
            expect(feintStage(s, 0)).toEqual("idle");
            s = signalAim(s, 0, 0);
            expect(feintStage(s, 10)).toEqual("baiting");
            expect(feintStage(s, 48)).toEqual("break");
        });

        it("should save a player who fires into the guarded bait lane (never switches)", () => {
            let s = feint(800);
            s = signalAim(s, 0, 0); // bait lane 0, never switch
            expect(resolveDrain(0, guardLaneAt(s, 100))).toEqual("save");
        });

        it("should drain a player who switches and fires during the recovery window", () => {
            let s = feint(800); // 48 ticks
            s = signalAim(s, 0, 0);    // bait lane 0
            s = signalAim(s, 1, 100);  // break to lane 1 after commit
            const covered = guardLaneAt(s, 110); // still on the bait (0)
            expect(covered).toEqual(0);
            expect(resolveDrain(1, covered)).toEqual("drain");
        });

        it("should close the break window once MAMORU re-commits", () => {
            let s = feint(800); // 48 ticks
            s = signalAim(s, 0, 0);
            s = signalAim(s, 1, 100); // break
            expect(guardLaneAt(s, 148)).toEqual(1); // re-committed to the new lane
            expect(resolveDrain(1, guardLaneAt(s, 148))).toEqual("save"); // too slow
        });

        it("should allow precision release as soon as a lane is called", () => {
            let s = precision();
            expect(canRelease(s, 0)).toBe(false);
            s = signalAim(s, 1, 0);
            expect(canRelease(s, 1)).toBe(true);
        });
    });

    describe("feint hold policy — MAMORU reads the feint", () => {
        it("should guard the pre-committed lane regardless of the player's aim", () => {
            let s = feintHold(800, 0, 0); // MAMORU holds lane 0
            s = signalAim(s, 1, 0);        // player aims lane 1
            expect(guardLaneAt(s, 0)).toEqual(0);
            expect(guardLaneAt(s, 100)).toEqual(0);  // never chases
            expect(guardLaneAt(s, 1000)).toEqual(0); // never chases
        });

        it("should save the rote script when the guard matches the switched lane", () => {
            // Rote: bait lane 0 → switch to 1 → fire lane 1.
            // If MAMORU holds lane 1 (the switched lane), the shot is saved.
            let s = feintHold(800, 0, 1); // MAMORU holds lane 1
            s = signalAim(s, 0, 0);       // bait lane 0
            s = signalAim(s, 1, 100);     // break to lane 1
            const covered = guardLaneAt(s, 110);
            expect(covered).toEqual(1);   // MAMORU is on 1
            expect(resolveDrain(1, covered)).toEqual("save"); // rote script fails
        });

        it("should drain the rote script when the guard is the other lane", () => {
            // If MAMORU holds lane 0, the rote's switch to lane 1 drains.
            let s = feintHold(800, 0, 0);
            s = signalAim(s, 0, 0);
            s = signalAim(s, 1, 100);
            const covered = guardLaneAt(s, 110);
            expect(covered).toEqual(0);
            expect(resolveDrain(1, covered)).toEqual("drain");
        });

        it("should make the feint meaningless (no reaction race)", () => {
            let s = feintHold(800, 0, 0);
            s = signalAim(s, 0, 0);
            // The guard is fixed from serve start — no delay, no chase.
            expect(guardLaneAt(s, 0)).toEqual(0);
            expect(guardLaneAt(s, 48)).toEqual(0); // reaction time irrelevant
        });

        it("should allow immediate release on hold serves (no reaction race)", () => {
            let s = feintHold(800, 0, 0); // 48 ticks
            expect(canRelease(s, 0)).toBe(false);   // no lane yet
            s = signalAim(s, 0, 0);                  // aim
            expect(canRelease(s, 0)).toBe(true);     // immediate — no race
            expect(feintStage(s, 0)).toEqual("break"); // immediate break
        });
    });
});
