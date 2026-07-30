import { describe, it, expect } from "vitest";
import { worldGravityX, worldGravityY } from "@/model/world-physics";
import { GRAVITY } from "@/definitions/game";
import type { TablePhysics } from "@/definitions/game";

describe("world-physics (A4)", () => {

    describe("worldGravityX()", () => {
        it("should hold gravity.x at 0 for a still world", () => {
            expect(worldGravityX(undefined, 1234)).toEqual(0);
            expect(worldGravityX({}, 1234)).toEqual(0);
            expect(worldGravityX({ gravityScale: 0.9 }, 1234)).toEqual(0);
        });

        it("should be deterministic for the same tick (replay-safe)", () => {
            const wp: TablePhysics = { sway: { amplitude: 0.06, periodTicks: 240 } };
            expect(worldGravityX(wp, 500)).toEqual(worldGravityX(wp, 500));
        });

        it("should peak at the sway amplitude a quarter-period in", () => {
            const wp: TablePhysics = { sway: { amplitude: 0.06, periodTicks: 240 } };
            // sin(2π · 60 / 240) = sin(π/2) = 1 → gravity.x = amplitude
            expect(worldGravityX(wp, 60)).toBeCloseTo(0.06, 10);
        });

        it("should return to zero at the half-period", () => {
            const wp: TablePhysics = { sway: { amplitude: 0.06, periodTicks: 240 } };
            // sin(2π · 120 / 240) = sin(π) = 0
            expect(worldGravityX(wp, 120)).toBeCloseTo(0, 10);
        });

        it("should never exceed the configured amplitude", () => {
            const wp: TablePhysics = { sway: { amplitude: 0.06, periodTicks: 240 } };
            for (let tick = 0; tick < 480; tick++) {
                expect(Math.abs(worldGravityX(wp, tick))).toBeLessThanOrEqual(0.06 + 1e-9);
            }
        });
    });

    describe("worldGravityY()", () => {
        it("should default to GRAVITY for a still world", () => {
            expect(worldGravityY(undefined)).toEqual(GRAVITY);
            expect(worldGravityY({})).toEqual(GRAVITY);
        });

        it("should scale gravity for a low-g world", () => {
            expect(worldGravityY({ gravityScale: 0.92 })).toBeCloseTo(GRAVITY * 0.92, 10);
        });
    });
});
