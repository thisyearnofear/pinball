import { describe, it, expect } from "vitest";
import { sealFromReplayHash, sealRotation, SEAL_RING_ROTATIONS } from "@/utils/seal";

describe("seal (A3)", () => {

    describe("sealFromReplayHash()", () => {
        it("should derive the fragment from the first four hex chars", () => {
            const seal = sealFromReplayHash("0xa6f3deadbeef");
            expect(seal?.fragment).toEqual("a6f3");
        });

        it("should lowercase an uppercase hash fragment", () => {
            const seal = sealFromReplayHash("0xA6F3DEADBEEF");
            expect(seal?.fragment).toEqual("a6f3");
        });

        it("should derive the ring deterministically from the first byte", () => {
            // first byte 0xa6 = 166; 166 % 5 = 1
            const seal = sealFromReplayHash("0xa6f3deadbeef");
            expect(seal?.ring).toEqual(166 % 5);
        });

        it("should be deterministic for the same hash", () => {
            const hash = "0x1234567890abcdef";
            expect(sealFromReplayHash(hash)).toEqual(sealFromReplayHash(hash));
        });

        it("should return null for a missing hash", () => {
            expect(sealFromReplayHash(undefined)).toBeNull();
            expect(sealFromReplayHash(null)).toBeNull();
            expect(sealFromReplayHash("")).toBeNull();
        });

        it("should return null for a malformed hash", () => {
            expect(sealFromReplayHash("a6f3")).toBeNull();          // no 0x prefix
            expect(sealFromReplayHash("0xzzzz")).toBeNull();        // non-hex
            expect(sealFromReplayHash("0x1234")).toBeNull();        // too short (< 8 hex)
        });
    });

    describe("sealRotation()", () => {
        it("should map each ring index to a tuned rotation", () => {
            SEAL_RING_ROTATIONS.forEach((deg, i) => {
                expect(sealRotation(i)).toEqual(deg);
            });
        });

        it("should wrap out-of-range indices into the five rings", () => {
            expect(sealRotation(5)).toEqual(SEAL_RING_ROTATIONS[0]);
            expect(sealRotation(7)).toEqual(SEAL_RING_ROTATIONS[2]);
            expect(sealRotation(-1)).toEqual(SEAL_RING_ROTATIONS[4]);
        });
    });
});
