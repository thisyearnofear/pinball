import { describe, it, expect, afterEach } from "vitest";
import { pulseBpmForMood, startMachinePulse, stopMachinePulse } from "@/services/audio-service";

describe("audio service (B3)", () => {

    afterEach(() => {
        stopMachinePulse();
    });

    describe("pulseBpmForMood()", () => {
        it("should beat slowly when calm", () => {
            expect(pulseBpmForMood("calm")).toEqual(60);
            expect(pulseBpmForMood("smug")).toEqual(60);
        });

        it("should quicken as the machine destabilizes", () => {
            expect(pulseBpmForMood("wary")).toEqual(90);
            expect(pulseBpmForMood("desperate")).toEqual(120);
            expect(pulseBpmForMood("enraged")).toEqual(120);
        });

        it("should stop the heartbeat when grieving", () => {
            expect(pulseBpmForMood("grieving")).toEqual(0);
        });

        it("should fall back to the calm tempo for an unknown mood", () => {
            expect(pulseBpmForMood("???")).toEqual(60);
        });
    });

    describe("machine pulse lifecycle", () => {
        it("should start and stop without throwing when audio is not inited", () => {
            expect(() => startMachinePulse(() => "calm")).not.toThrow();
            expect(() => stopMachinePulse()).not.toThrow();
        });

        it("should make stop idempotent", () => {
            startMachinePulse(() => "desperate");
            stopMachinePulse();
            expect(() => stopMachinePulse()).not.toThrow();
        });
    });
});
