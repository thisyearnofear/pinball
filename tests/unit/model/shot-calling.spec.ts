import { describe, it, expect } from "vitest";
import {
    createShotState, beginServe, signalAim, guardLaneAt, meterPosition, accuracyForPosition,
    launchVector, resolveRelease, saveChargeFraction, laneForX, resolveDrain,
    reactionMsToTicks, TICKS_PER_SECOND,
} from "@/model/shot-calling";
import { IMMERSION } from "@/config/immersion-tuning";
import { mulberry32 } from "@/utils/rng";

const LANES = IMMERSION.shotCalling.lanes;

function state(reactionMs = 150, startTick = 0) {
    return createShotState(LANES, reactionMs, startTick);
}

describe("shot-calling core", () => {

    describe("reactionMsToTicks()", () => {
        it("should convert ms to 60Hz ticks", () => {
            expect(reactionMsToTicks(150)).toBeCloseTo(9, 5);
            expect(reactionMsToTicks(1000)).toEqual(TICKS_PER_SECOND);
        });
    });

    describe("guardLaneAt() — the visible reaction contest", () => {
        it("should be uncommitted before any aim settles", () => {
            const s = state(150); // reactionTicks = 9
            expect(guardLaneAt(s, 0)).toBeNull();
            expect(guardLaneAt(s, 5)).toBeNull();
        });

        it("should commit to the aimed lane after the reaction delay", () => {
            const s = state(150); // aims lane 0 at tick 0
            expect(guardLaneAt(s, 9)).toEqual(0);
            expect(guardLaneAt(s, 100)).toEqual(0);
        });

        it("should make a slow machine exploitable (easy 250ms)", () => {
            const s = state(250); // reactionTicks = 15
            expect(guardLaneAt(s, 10)).toBeNull(); // still not committed at tick 10
            expect(guardLaneAt(s, 15)).toEqual(0);
        });
    });

    describe("signalAim() + feints", () => {
        it("should be a no-op when the lane is unchanged", () => {
            const s = state();
            expect(signalAim(s, 0, 5)).toBe(s);
        });

        it("should leave a committed machine guarding the old lane after a feint", () => {
            let s = state(150);            // aim lane 0 at tick 0
            s = signalAim(s, 1, 20);       // machine committed to 0 by tick 20; feint to 1
            // guard stays on 0 until the reaction elapses from the feint (20 + 9 = 29)
            expect(guardLaneAt(s, 20)).toEqual(0);
            expect(guardLaneAt(s, 28)).toEqual(0);
            expect(guardLaneAt(s, 29)).toEqual(1);
        });

        it("should not commit a machine that had not yet reacted to a feint", () => {
            let s = state(150);            // aim lane 0 at tick 0
            s = signalAim(s, 1, 3);        // feint before the machine committed (tick 3 < 9)
            expect(guardLaneAt(s, 3)).toBeNull();
            expect(guardLaneAt(s, 12)).toEqual(1); // catches up to the new aim
        });
    });

    describe("meterPosition()", () => {
        it("should start at 0 and peak at the sweet spot mid-cycle", () => {
            const s = state();
            expect(meterPosition(s, 0)).toBeCloseTo(0, 5);
            const ticksPerCycle = TICKS_PER_SECOND / IMMERSION.shotCalling.meterSpeed;
            expect(meterPosition(s, Math.round(ticksPerCycle / 2))).toBeCloseTo(1, 1);
        });

        it("should be periodic", () => {
            const s = state();
            const ticksPerCycle = TICKS_PER_SECOND / IMMERSION.shotCalling.meterSpeed;
            expect(meterPosition(s, 7)).toBeCloseTo(meterPosition(s, 7 + ticksPerCycle), 5);
        });
    });

    describe("accuracyForPosition()", () => {
        it("should be perfect at center", () => {
            expect(accuracyForPosition(0.5)).toEqual(1);
        });

        it("should fall off away from center and floor at 0", () => {
            const near = accuracyForPosition(0.5 + IMMERSION.shotCalling.meterSweetSpot / 2);
            expect(near).toBeGreaterThan(0);
            expect(near).toBeLessThan(1);
            expect(accuracyForPosition(0)).toEqual(0);
            expect(accuracyForPosition(1)).toEqual(0);
        });
    });

    describe("launchVector()", () => {
        it("should bias left/right by lane at full accuracy", () => {
            const rng = mulberry32(1);
            const left = launchVector(0, LANES, 1, 20, rng);
            const right = launchVector(LANES - 1, LANES, 1, 20, mulberry32(1));
            expect(left.x).toBeLessThan(0);
            expect(right.x).toBeGreaterThan(0);
            expect(left.y).toBeLessThan(0); // up the table
        });

        it("should be deterministic for the same seed", () => {
            const a = launchVector(1, LANES, 0.4, 20, mulberry32(99));
            const b = launchVector(1, LANES, 0.4, 20, mulberry32(99));
            expect(a).toEqual(b);
        });

        it("should scatter more as accuracy drops", () => {
            // sample spread of launch angles at low vs high accuracy
            const spread = (acc: number) => {
                const xs: number[] = [];
                for (let i = 0; i < 200; i++) xs.push(launchVector(0, LANES, acc, 20, mulberry32(i)).x);
                return Math.max(...xs) - Math.min(...xs);
            };
            expect(spread(0)).toBeGreaterThan(spread(1));
        });
    });

    describe("resolveRelease()", () => {
        it("should return accuracy and a launch vector", () => {
            const s = state();
            const r = resolveRelease(s, 0, 20, mulberry32(1));
            expect(r.accuracy).toBeGreaterThanOrEqual(0);
            expect(r.accuracy).toBeLessThanOrEqual(1);
            expect(r.launch.y).toBeLessThan(0);
        });
    });

    describe("saveChargeFraction()", () => {
        it("should charge from 0 to 1 over the rally", () => {
            const s = state(150, 0);
            expect(saveChargeFraction(s, 0)).toEqual(0);
            const fullTicks = (IMMERSION.shotCalling.saveChargeMs / 1000) * TICKS_PER_SECOND;
            expect(saveChargeFraction(s, Math.ceil(fullTicks))).toEqual(1);
            expect(saveChargeFraction(s, Math.ceil(fullTicks) + 1000)).toEqual(1);
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
        it("should save when armed, covering, and the ball lands there", () => {
            expect(resolveDrain(1, 1, true)).toEqual("save");
        });

        it("should drain when the ball lands in an unguarded lane", () => {
            expect(resolveDrain(0, 1, true)).toEqual("drain");
        });

        it("should drain when the save is not armed", () => {
            expect(resolveDrain(1, 1, false)).toEqual("drain");
        });

        it("should drain when nothing is covered", () => {
            expect(resolveDrain(0, null, true)).toEqual("drain");
        });
    });

    describe("beginServe()", () => {
        it("should reset the aim/meter and bump the serve count", () => {
            let s = state();
            s = signalAim(s, 1, 30);
            s = beginServe(s, 100);
            expect(s.serveCount).toEqual(1);
            expect(s.aimedLane).toEqual(0);
            expect(s.phase).toEqual("aiming");
            expect(s.meterStartTick).toEqual(100);
        });
    });
});
