import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("@/config/app-config", () => ({
    getAppConfig: () => ({ backend: { baseUrl: "https://api.test" } }),
}));

import {
    prefetchQuantumSeeds,
    nextRunSeed,
    lastSeedSource,
    resetQuantumSeedCache,
} from "@/services/quantum-seed";

describe("quantum seed service", () => {
    beforeEach(() => {
        resetQuantumSeedCache();
        axiosGet.mockReset();
    });

    it("should hand out prefetched QRNG seeds and report the source", async () => {
        axiosGet.mockResolvedValue({ data: { seeds: [111, 222, 333], source: "qrng" } });

        await prefetchQuantumSeeds();

        expect(axiosGet).toHaveBeenCalledTimes(1);
        expect(nextRunSeed()).toBe(111);
        expect(lastSeedSource()).toBe("qrng");
        expect(nextRunSeed()).toBe(222);
        expect(lastSeedSource()).toBe("qrng");
    });

    it("should report the backend's CSPRNG source when the provider was unavailable", async () => {
        axiosGet.mockResolvedValue({ data: { seeds: [7, 8], source: "csprng" } });

        await prefetchQuantumSeeds();

        expect(nextRunSeed()).toBe(7);
        expect(lastSeedSource()).toBe("csprng");
    });

    it("should fall back to a local seed when the backend is unreachable", async () => {
        axiosGet.mockRejectedValue(new Error("offline"));

        await prefetchQuantumSeeds();
        const seed = nextRunSeed();

        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(0xffffffff);
        expect(lastSeedSource()).toBe("local");
    });

    it("should fall back to a local seed when the payload is unusable", async () => {
        axiosGet.mockResolvedValue({ data: { seeds: [], source: "qrng" } });

        await prefetchQuantumSeeds();

        expect(lastSeedSource()).toBe("local");
        expect(Number.isInteger(nextRunSeed())).toBe(true);
        // An empty batch must not poison the source label.
        expect(lastSeedSource()).toBe("local");
    });

    it("should drop non-uint32 values from a batch", async () => {
        axiosGet.mockResolvedValue({ data: { seeds: [5, "x", -1, 2.5, 6], source: "qrng" } });

        await prefetchQuantumSeeds();

        expect(nextRunSeed()).toBe(5);
        expect(nextRunSeed()).toBe(6);
    });

    it("should not fetch twice concurrently", async () => {
        axiosGet.mockResolvedValue({ data: { seeds: [1], source: "qrng" } });

        await Promise.all([prefetchQuantumSeeds(), prefetchQuantumSeeds()]);

        expect(axiosGet).toHaveBeenCalledTimes(1);
    });
});
