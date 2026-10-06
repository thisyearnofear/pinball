import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeedAudit } from "@/game/ui/SeedAudit";
import { seedFingerprint, shortHash } from "@/utils/seed-audit";

function html(props: React.ComponentProps<typeof SeedAudit>): string {
    return renderToStaticMarkup(React.createElement(SeedAudit, props));
}

describe("SeedAudit readout", () => {
    it("shows provenance, the seed, its fingerprint, and the replay hash (full)", () => {
        const markup = html({
            seed: 123456,
            seedSource: "qrng",
            replayHash: "0x" + "ab".repeat(32),
        });
        expect(markup).toContain("SEED AUDIT");
        expect(markup).toContain("QUANTUM-SEEDED");
        expect(markup).toContain("123456");
        expect(markup).toContain("SEED HASH");
        expect(markup).toContain(shortHash(seedFingerprint(123456), 10));
        expect(markup).toContain("REPLAY HASH");
    });

    it("carries the full fingerprint in the title so it can be copied/compared", () => {
        const full = seedFingerprint(777);
        const markup = html({ seed: 777, seedSource: "csprng" });
        expect(markup).toContain(full);
    });

    it("omits the replay-hash row when none is supplied", () => {
        const markup = html({ seed: 5, seedSource: "local" });
        expect(markup).toContain("SEED HASH");
        expect(markup).not.toContain("REPLAY HASH");
    });

    it("renders the compact variant as provenance symbol + short hash", () => {
        const markup = html({
            seed: 42,
            seedSource: "qrng",
            replayHash: "0x" + "cd".repeat(32),
            variant: "compact",
        });
        expect(markup).not.toContain("SEED AUDIT");
        expect(markup).toContain("⚛");
        expect(markup).toContain(shortHash(seedFingerprint(42), 6));
        expect(markup).toContain(seedFingerprint(42));
    });

    it("renders a tap-to-copy control for each audited value (full)", () => {
        const markup = html({
            seed: 123456,
            seedSource: "qrng",
            replayHash: "0x" + "ab".repeat(32),
        });
        expect(markup).toContain('aria-label="Copy seed"');
        expect(markup).toContain('aria-label="Copy seed hash"');
        expect(markup).toContain('aria-label="Copy replay hash"');
    });

    it("exposes no copy control for a value that was not recorded", () => {
        const markup = html({ seed: 5, seedSource: "local" });
        expect(markup).toContain('aria-label="Copy seed hash"');
        expect(markup).not.toContain('aria-label="Copy replay hash"');
    });

    it("makes the compact line a single copy control", () => {
        const markup = html({ seed: 42, seedSource: "qrng", variant: "compact" });
        expect(markup).toContain('aria-label="Copy seed audit"');
        expect(markup).toContain("Tap to copy");
    });

    it("labels an unlabelled seed source as a neutral fact, not a warning", () => {
        const markup = html({ seed: 9 });
        expect(markup).toContain("SEED ON RECORD");
        expect(markup).not.toContain("QUANTUM");
        // The default state must not read as something missing or failed.
        const upper = markup.toUpperCase();
        for (const banned of ["UNRECORDED", "UNKNOWN", "MISSING", "UNVERIFIED"]) {
            expect(upper).not.toContain(banned);
        }
    });

    it("renders nothing for a digest with no auditable seed or replay hash", () => {
        expect(html({})).toBe("");
        expect(html({ seedSource: "qrng" })).toBe("");
    });

    it("still audits a run when only the replay hash is known", () => {
        const markup = html({ replayHash: "0x" + "ef".repeat(32) });
        expect(markup).toContain("REPLAY HASH");
        expect(markup).not.toContain("SEED HASH");
    });
});

describe("SeedAudit MOTH attestation rows", () => {
    const attestation = {
        provider: "moth",
        mode: "qpu",
        jobId: "b0ebb149-087d-4f5a-93d1-168e85859c73",
        pulseHash: "cd".repeat(32),
        backend: "ibm_torino",
        bellViolation: true,
    };

    it("shows the MOTH job, pulse hash, backend and witness for a MOTH seed", () => {
        const markup = html({ seed: 42, seedSource: "moth-qpu", seedAttestation: attestation });
        expect(markup).toContain("QPU-SEEDED");
        expect(markup).toContain("MOTH JOB");
        expect(markup).toContain("b0ebb149…");
        expect(markup).toContain(attestation.jobId);
        expect(markup).toContain("PULSE HASH");
        expect(markup).toContain(attestation.pulseHash);
        expect(markup).toContain("BACKEND");
        expect(markup).toContain("ibm_torino");
        expect(markup).toContain("BELL WITNESS");
    });

    it("labels an emu seed as simulator output", () => {
        const markup = html({
            seed: 42,
            seedSource: "moth-emu",
            seedAttestation: { ...attestation, mode: "emu", backend: "aer" },
        });
        expect(markup).toContain("SIMULATED QRNG");
        expect(markup).not.toContain("QPU-SEEDED");
        expect(markup).toContain("aer");
    });

    it("ignores an attestation on a non-MOTH source or a malformed one", () => {
        expect(html({ seed: 42, seedSource: "qrng", seedAttestation: attestation })).not.toContain("MOTH JOB");
        expect(
            html({ seed: 42, seedSource: "moth-emu", seedAttestation: { ...attestation, jobId: "<b>x</b>" } }),
        ).not.toContain("MOTH JOB");
    });

    it("keeps the existing rows for a MOTH seed with no attestation", () => {
        const markup = html({ seed: 42, seedSource: "moth-emu" });
        expect(markup).toContain("SEED HASH");
        expect(markup).not.toContain("MOTH JOB");
    });
});

