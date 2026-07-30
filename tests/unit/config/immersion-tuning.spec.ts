import { describe, it, expect } from "vitest";
import { IMMERSION } from "@/config/immersion-tuning";

/**
 * Sanity bounds on the immersion tuning knobs. These guard against an
 * accidental bad edit during playtest (e.g. a mood variance that breaks the
 * rubber-band precedent, or a kill-cam timeScale outside (0,1)).
 */
describe("immersion tuning", () => {

    it("should keep mood accuracy variance within the rubber-band precedent", () => {
        expect(IMMERSION.mood.accuracyVariance).toBeGreaterThan(0);
        expect(IMMERSION.mood.accuracyVariance).toBeLessThanOrEqual(0.05);
    });

    it("should order the mood time thresholds", () => {
        expect(IMMERSION.mood.waryTimeAliveMs).toBeLessThan(IMMERSION.mood.desperateTimeAliveMs);
        expect(IMMERSION.mood.smugAfterSaveMinMs).toBeLessThan(IMMERSION.mood.smugAfterSaveMaxMs);
    });

    it("should keep the kill cam a valid slow-mo that releases on time", () => {
        expect(IMMERSION.killCam.timeScale).toBeGreaterThan(0);
        expect(IMMERSION.killCam.timeScale).toBeLessThan(1);
        expect(IMMERSION.killCam.releaseDelayMs).toEqual(IMMERSION.killCam.durationMs);
        expect(IMMERSION.killCam.duckLevel).toBeGreaterThan(0);
        expect(IMMERSION.killCam.duckLevel).toBeLessThan(1);
    });

    it("should stop the pulse when grieving and beat otherwise", () => {
        expect(IMMERSION.pulse.bpm.grieving).toEqual(0);
        for (const [mood, bpm] of Object.entries(IMMERSION.pulse.bpm)) {
            if (mood !== "grieving") expect(bpm).toBeGreaterThan(0);
        }
        expect(IMMERSION.pulse.gain).toBeLessThan(IMMERSION.pulse.intenseGain);
    });

    it("should keep habit reading sane", () => {
        expect(IMMERSION.habits.minNudges).toBeGreaterThan(0);
        expect(IMMERSION.habits.dominance).toBeGreaterThan(0.5);
        expect(IMMERSION.habits.dominance).toBeLessThanOrEqual(1);
    });

    it("should keep world sway gentle (felt but fair)", () => {
        expect(IMMERSION.worlds.pirateShip.swayAmplitude).toBeLessThan(0.1);
        expect(IMMERSION.worlds.spaceship.swayAmplitude).toBeLessThan(0.1);
        expect(IMMERSION.worlds.spaceship.gravityScale).toBeGreaterThan(0.5);
        expect(IMMERSION.worlds.spaceship.gravityScale).toBeLessThanOrEqual(1);
    });
});
