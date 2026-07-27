import { describe, it, expect } from "vitest";
import { mulberry32, createRunSeed } from "@/utils/rng";

describe("seeded RNG", () => {
    it("should produce an identical sequence for the same seed", () => {
        const a = mulberry32(123456789);
        const b = mulberry32(123456789);
        for (let i = 0; i < 100; i++) {
            expect(a()).toEqual(b());
        }
    });

    it("should produce different sequences for different seeds", () => {
        const a = mulberry32(1);
        const b = mulberry32(2);
        const seqA = Array.from({ length: 10 }, () => a());
        const seqB = Array.from({ length: 10 }, () => b());
        expect(seqA).not.toEqual(seqB);
    });

    it("should only produce values in [0, 1)", () => {
        const rng = mulberry32(0xdeadbeef);
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("should create run seeds that fit in 32 bits", () => {
        for (let i = 0; i < 10; i++) {
            const seed = createRunSeed();
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(0xffffffff);
        }
    });
});
