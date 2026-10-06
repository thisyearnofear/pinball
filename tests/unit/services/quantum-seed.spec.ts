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
    lastSeedAttestation,
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

    describe("MOTH comet-qrng-v1 batches", () => {
        const attestation = {
            provider: "moth",
            engine: "comet-qrng-v1",
            mode: "qpu",
            jobId: "b0ebb149-087d-4f5a-93d1-168e85859c73",
            pulseHash: "ab".repeat(32),
            backend: "ibm_torino",
            bellViolation: true,
        };

        it("hands out MOTH QPU seeds with their job/pulse attestation", async () => {
            axiosGet.mockResolvedValue({ data: { seeds: [4000000000, 5], source: "moth-qpu", attestation } });

            await prefetchQuantumSeeds();

            expect(nextRunSeed()).toBe(4000000000);
            expect(lastSeedSource()).toBe("moth-qpu");
            expect(lastSeedAttestation()).toEqual(attestation);
        });

        it("keeps emu (simulator) provenance distinct from hardware", async () => {
            axiosGet.mockResolvedValue({
                data: { seeds: [9], source: "moth-emu", attestation: { ...attestation, mode: "emu", backend: "aer" } },
            });

            await prefetchQuantumSeeds();

            expect(nextRunSeed()).toBe(9);
            expect(lastSeedSource()).toBe("moth-emu");
            expect(lastSeedAttestation()?.mode).toBe("emu");
            expect(lastSeedAttestation()?.backend).toBe("aer");
        });

        it("drops a malformed attestation but keeps the seed", async () => {
            axiosGet.mockResolvedValue({
                data: { seeds: [9], source: "moth-emu", attestation: { provider: "moth", mode: "emu", jobId: "<script>" } },
            });

            await prefetchQuantumSeeds();

            expect(nextRunSeed()).toBe(9);
            expect(lastSeedSource()).toBe("moth-emu");
            expect(lastSeedAttestation()).toBeUndefined();
        });

        it("ignores an attestation riding on a non-MOTH batch", async () => {
            axiosGet.mockResolvedValue({ data: { seeds: [1], source: "csprng", attestation } });

            await prefetchQuantumSeeds();

            nextRunSeed();
            expect(lastSeedSource()).toBe("csprng");
            expect(lastSeedAttestation()).toBeUndefined();
        });

        it("collapses an unknown source label to csprng rather than over-claiming", async () => {
            axiosGet.mockResolvedValue({ data: { seeds: [1], source: "moth-hardware-ish" } });

            await prefetchQuantumSeeds();

            nextRunSeed();
            expect(lastSeedSource()).toBe("csprng");
        });

        it("clears the attestation once seeds fall back to local", async () => {
            axiosGet.mockResolvedValueOnce({ data: { seeds: [1], source: "moth-qpu", attestation } });
            await prefetchQuantumSeeds();
            nextRunSeed();
            expect(lastSeedAttestation()).toBeDefined();

            axiosGet.mockRejectedValue(new Error("offline"));
            nextRunSeed();
            expect(lastSeedSource()).toBe("local");
            expect(lastSeedAttestation()).toBeUndefined();
        });
    });
});
