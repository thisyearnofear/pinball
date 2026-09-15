import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplayVerification } from "@/game/ui/ReplayVerification";
import { encodeReplay, type ReplayDigest } from "@/model/replay-recorder";
import { replayHashOf, shortHash } from "@/utils/seed-audit";
import { colors } from "@/theme/tokens";

const digest: ReplayDigest = {
    v: 1,
    seed: 7,
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

function html(props: React.ComponentProps<typeof ReplayVerification>): string {
    return renderToStaticMarkup(React.createElement(ReplayVerification, props));
}

describe("ReplayVerification", () => {
    it("reports a match when the metadata committed to this replay", () => {
        const markup = html({ replay: digest, metadata: JSON.stringify({ mode: "kamikaze", table: 1, replayHash: hash }) });
        expect(markup).toContain("SCORE METADATA");
        expect(markup).toContain("HASH MATCHES");
        expect(markup).toContain("✓");
        expect(markup).toContain(shortHash(hash, 10));
        expect(markup).not.toContain("HASH MISMATCH");
    });

    it("reports a mismatch and shows both hashes side by side", () => {
        const other = "0x" + "cd".repeat(32);
        const markup = html({ replay: digest, metadata: JSON.stringify({ replayHash: other }) });
        expect(markup).toContain("HASH MISMATCH");
        expect(markup).toContain("✗");
        expect(markup).toContain(shortHash(hash, 10));
        expect(markup).toContain(shortHash(other, 10));
    });

    it("reports no-record as informational (never a pass, never a failure)", () => {
        const markup = html({ replay: digest });
        expect(markup).toContain("NO SCORE RECORD");
        expect(markup).toContain("Nothing to compare");
        expect(markup).not.toContain("HASH MATCHES");
        // Informational, not an error — and never worded as distrust.
        expect(markup).toContain(colors.status.info);
        expect(markup).not.toContain(colors.status.error);
        expect(markup.toLowerCase()).not.toContain("unverified");
    });

    it("raises a warning note when the metadata disagrees with the replay", () => {
        const markup = html({
            replay: digest,
            metadata: JSON.stringify({ mode: "classic", table: 9, replayHash: hash }),
        });
        expect(markup).toContain("⚠");
        // renderToStaticMarkup escapes the quotes around field values.
        expect(markup).toContain("metadata mode &quot;classic&quot;");
        expect(markup).toContain("metadata table 9");
    });

    it("flags a recorded hash that drifts from the recomputed one", () => {
        const markup = html({ replay: digest, metadata: JSON.stringify({ replayHash: hash }), recordedHash: "0x" + "ef".repeat(32) });
        expect(markup).toContain("recorded replay hash differs");
    });

    it("checks a supplied payload hash (ghost path) instead of re-encoding", () => {
        const markup = html({ actualHash: hash, metadata: JSON.stringify({ replayHash: hash }) });
        expect(markup).toContain("HASH MATCHES");
        expect(markup).not.toContain("NO SCORE RECORD");
    });

    it("renders nothing without a replay or a hash", () => {
        expect(html({ metadata: JSON.stringify({ replayHash: hash }) })).toBe("");
    });
});

describe("ReplayVerification — copy score metadata", () => {
    it("offers a copy control when metadata is present (full)", () => {
        const markup = html({ replay: digest, metadata: JSON.stringify({ mode: "kamikaze", replayHash: hash }) });
        expect(markup).toContain('aria-label="Copy score metadata"');
    });

    it("omits the copy control when there is no metadata", () => {
        const markup = html({ replay: digest });
        expect(markup).not.toContain('aria-label="Copy score metadata"');
    });

    it("does not offer a copy control for blank metadata", () => {
        const markup = html({ replay: digest, metadata: "   " });
        expect(markup).not.toContain('aria-label="Copy score metadata"');
    });
});

describe("ReplayVerification — compact (ghost PiP)", () => {
    it("shows a short result word for each state", () => {
        expect(html({ variant: "compact", actualHash: hash, metadata: JSON.stringify({ replayHash: hash }) })).toContain("matches");
        expect(html({ variant: "compact", actualHash: hash, metadata: JSON.stringify({ replayHash: "0x" + "cd".repeat(32) }) })).toContain("mismatch");
        expect(html({ variant: "compact", actualHash: hash })).toContain("no record");
    });

    it("stays a single inline element (no panel chrome) and carries the full hash in its title", () => {
        const markup = html({ variant: "compact", actualHash: hash, metadata: JSON.stringify({ replayHash: hash }) });
        expect(markup).not.toContain("SCORE METADATA");
        expect(markup).toContain(hash);
    });
});
