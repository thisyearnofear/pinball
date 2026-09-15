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

    it("labels an unrecorded provenance honestly instead of guessing", () => {
        const markup = html({ seed: 9 });
        expect(markup).toContain("PROVENANCE UNRECORDED");
        expect(markup).not.toContain("QUANTUM");
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
