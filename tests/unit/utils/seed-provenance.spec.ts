import { describe, it, expect } from "vitest";
import { describeSeedProvenance, sanitizeSeedAttestation, seedProvenanceLine } from "@/utils/seed-provenance";

describe("describeSeedProvenance", () => {
    it("maps each recorded source to distinct copy and tone", () => {
        const qrng = describeSeedProvenance("qrng");
        const csprng = describeSeedProvenance("csprng");
        const local = describeSeedProvenance("local");

        expect(qrng.tone).toBe("quantum");
        expect(qrng.label).toBe("QUANTUM-SEEDED");
        expect(qrng.symbol).toBe("⚛");

        expect(csprng.tone).toBe("server");
        expect(local.tone).toBe("device");

        // The three badges must be visually distinguishable.
        const colours = new Set([qrng.color, csprng.color, local.color]);
        expect(colours.size).toBe(3);
        const labels = new Set([qrng.label, csprng.label, local.label]);
        expect(labels.size).toBe(3);
    });

    it("falls back to an unrecorded state for missing/unknown values", () => {
        for (const value of [undefined, null, "", "moth", "QRNG"]) {
            const p = describeSeedProvenance(value);
            expect(p.tone).toBe("unknown");
            expect(p.source).toBe("unrecorded");
        }
    });

    it("the default state reads as a neutral fact, not as distrust", () => {
        // The audit surfaces open on this state, so it must not look like a
        // failed check or a missing requirement.
        const p = describeSeedProvenance(undefined);
        const copy = `${p.label} ${p.phrase}`.toLowerCase();
        expect(p.label).toBe("SEED ON RECORD");
        expect(p.symbol).toBe("◆");
        for (const banned of ["unrecorded", "unknown", "missing", "unverified", "cannot"]) {
            expect(copy).not.toContain(banned);
        }
    });

    it("keeps the default state visually distinct from the three known sources", () => {
        const known = ["qrng", "csprng", "local"].map((s) => describeSeedProvenance(s));
        const fallback = describeSeedProvenance(undefined);
        expect(new Set([...known.map((p) => p.color), fallback.color]).size).toBe(4);
        expect(new Set([...known.map((p) => p.symbol), fallback.symbol]).size).toBe(4);
    });

    it("never claims a quantum seed changes the outcome", () => {
        const p = describeSeedProvenance("qrng");
        const copy = `${p.label} ${p.phrase}`.toLowerCase();
        for (const banned of ["fair", "proof of fair", "unhackable", "guaranteed", "stronger"]) {
            expect(copy).not.toContain(banned);
        }
    });
});

describe("seedProvenanceLine", () => {
    it("returns a short line for known sources", () => {
        expect(seedProvenanceLine("qrng")).toBe("⚛ quantum RNG");
        expect(seedProvenanceLine("csprng")).toBe("◈ server CSPRNG");
        expect(seedProvenanceLine("local")).toBe("◇ device CSPRNG");
    });

    it("returns empty for unknown provenance (so callers omit the line)", () => {
        expect(seedProvenanceLine(undefined)).toBe("");
        expect(seedProvenanceLine("nope")).toBe("");
    });
});

describe("MOTH provenance labels", () => {
    it("labels MOTH QPU seeds as hardware quantum", () => {
        const p = describeSeedProvenance("moth-qpu");
        expect(p.source).toBe("moth-qpu");
        expect(p.label).toBe("QPU-SEEDED");
        expect(p.symbol).toBe("⚛");
        expect(p.tone).toBe("quantum");
        expect(p.phrase.toLowerCase()).toContain("hardware");
    });

    it("labels MOTH emu seeds as simulator output, never as hardware quantum", () => {
        const p = describeSeedProvenance("moth-emu");
        expect(p.source).toBe("moth-emu");
        expect(p.tone).toBe("simulator");
        expect(p.symbol).not.toBe("⚛");
        const copy = `${p.label} ${p.phrase}`.toLowerCase();
        expect(copy).toContain("simulat");
        for (const banned of ["hardware", "qpu", "quantum-seeded"]) {
            expect(copy).not.toContain(banned);
        }
    });

    it("keeps all five recorded sources visually distinct", () => {
        const all = ["qrng", "moth-qpu", "moth-emu", "csprng", "local"].map((s) => describeSeedProvenance(s));
        expect(new Set(all.map((p) => p.label)).size).toBe(5);
        expect(new Set(all.map((p) => p.color)).size).toBe(5);
    });
});

describe("sanitizeSeedAttestation", () => {
    const good = {
        provider: "moth",
        engine: "comet-qrng-v1",
        mode: "emu",
        jobId: "b0ebb149-087d-4f5a-93d1-168e85859c73",
        pulseHash: "AB".repeat(32),
        backend: "aer",
        bellViolation: true,
    };

    it("accepts a well-formed MOTH attestation and normalises the pulse hash", () => {
        expect(sanitizeSeedAttestation(good)).toEqual({ ...good, pulseHash: "ab".repeat(32) });
    });

    it("rejects non-MOTH, bad-mode, or unsafe job ids", () => {
        for (const bad of [
            null,
            "x",
            { ...good, provider: "anu" },
            { ...good, mode: "hardware" },
            { ...good, jobId: "<img src=x>" },
            { ...good, jobId: 42 },
        ]) {
            expect(sanitizeSeedAttestation(bad)).toBeUndefined();
        }
    });

    it("drops malformed optional fields rather than rendering them", () => {
        const out = sanitizeSeedAttestation({ ...good, pulseHash: "0x123", backend: "a b", bellViolation: "yes" });
        expect(out).toEqual({ provider: "moth", engine: "comet-qrng-v1", mode: "emu", jobId: good.jobId });
    });
});
