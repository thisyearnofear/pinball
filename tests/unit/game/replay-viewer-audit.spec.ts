import React from "react";
import { beforeAll, describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplayViewer } from "@/game/ui/ReplayViewer";
import { encodeReplay, type ReplayDigest } from "@/model/replay-recorder";
import { replayHashOf } from "@/utils/seed-audit";

// jsdom has no matchMedia, which the Modal shell queries on first render.
beforeAll(() => {
    if (typeof window.matchMedia !== "function") {
        (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
    }
});

const digest: ReplayDigest = {
    v: 1,
    seed: 7,
    seedSource: "qrng",
    table: 1,
    mode: "kamikaze",
    aiDifficulty: "medium",
    tickCount: 90,
    finalScore: 4200,
    truncated: false,
    events: [{ t: 0, e: "spawn" }],
    trace: [0, 400, 300],
};

const hash = replayHashOf(encodeReplay(digest));
const signed = JSON.stringify({ mode: "kamikaze", table: 1, replayHash: hash });

function html(props: Partial<React.ComponentProps<typeof ReplayViewer>> = {}): string {
    return renderToStaticMarkup(
        React.createElement(ReplayViewer, { replay: digest, replayHash: hash, onClose: () => {}, ...props }),
    );
}

describe("ReplayViewer — collapsed audit", () => {
    it("shows a one-line status instead of the full proof panels", () => {
        const markup = html({ signedMetadata: signed });
        expect(markup).toContain("AUDIT");
        expect(markup).toContain("matches");
        // The panels themselves are not rendered until asked for.
        expect(markup).not.toContain("SEED AUDIT");
        expect(markup).not.toContain("SCORE METADATA");
    });

    it("offers a control that says what it opens, and reports its own state", () => {
        const markup = html({ signedMetadata: signed });
        expect(markup).toContain("Audit trail ▾");
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain('aria-controls="replay-audit-details"');
    });

    it("labels a run with no score record honestly, not as a pass", () => {
        const markup = html();
        expect(markup).toContain("no record");
        expect(markup).not.toContain("matches");
    });
});

describe("ReplayViewer — expanded audit", () => {
    it("renders both proof panels when opened", () => {
        const markup = html({ signedMetadata: signed, initialAuditOpen: true });
        expect(markup).toContain("Audit trail ▴");
        expect(markup).toContain('aria-expanded="true"');
        expect(markup).toContain('id="replay-audit-details"');
        expect(markup).toContain("SEED AUDIT");
        expect(markup).toContain("SCORE METADATA");
    });

    it("still exposes the recorded seed and both hashes", () => {
        const markup = html({ signedMetadata: signed, initialAuditOpen: true });
        expect(markup).toContain(">7<");
        expect(markup).toContain("REPLAY HASH");
        expect(markup).toContain("QUANTUM-SEEDED");
    });
});
