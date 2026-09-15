import React, { useMemo, useRef, useState } from "react";
import type { ReplayDigest } from "@/model/replay-recorder";
import { verifyReplayBinding, verifyReplayHash } from "@/utils/replay-verify";
import { isAuditHash, shortHash } from "@/utils/seed-audit";
import { copyToClipboard } from "@/utils/clipboard";

import { colors, radius, spacing, typography } from "@/theme/tokens";

type Props = {
    /** Replay being viewed; its hash is recomputed from the digest. */
    replay?: ReplayDigest;
    /**
     * Precomputed hash of the replay payload. Preferred when present (ghost
     * replays: the stored payload's hash is the real submission binding).
     */
    actualHash?: string;
    /** The signed score metadata payload this run was submitted with. */
    metadata?: string | null;
    /** Hash the app recorded for this replay (compared as a drift warning). */
    recordedHash?: string | null;
    /** "full" panel for the replay viewer; "compact" one-liner for the ghost PiP. */
    variant?: "full" | "compact";
};

/**
 * Copy + colour per result. Only a genuine mismatch is styled as a problem:
 * "nothing to compare" is an informational state, not distrust — most players
 * meet it on their first practice run, so it must not read as a failed check.
 */
const STATUS: Record<string, { label: string; short: string; color: string; symbol: string }> = {
    match: { label: "HASH MATCHES", short: "matches", color: colors.status.success, symbol: "✓" },
    mismatch: { label: "HASH MISMATCH", short: "mismatch", color: colors.status.error, symbol: "✗" },
    unavailable: { label: "NO SCORE RECORD", short: "no record", color: colors.status.info, symbol: "○" },
};

function statusFor(status: string) {
    return STATUS[status] ?? STATUS.unavailable;
}

/**
 * Replay ↔ signed-score-metadata verification.
 *
 * Recomputes `keccak256(encodeReplay(replay))` (or takes the hash of the stored
 * payload) and compares it with the `replayHash` the score metadata committed to
 * — the same binding the backend checks before signing. The result is
 * deliberately narrow: it proves the replay being viewed is the payload that was
 * submitted, and nothing more (it is not a signature check and does not
 * re-simulate the run).
 */
export function ReplayVerification({ replay, actualHash, metadata, recordedHash, variant = "full" }: Props) {
    const binding = useMemo(() => {
        if (actualHash) return verifyReplayHash(actualHash, metadata, recordedHash, replay ?? null);
        if (replay) return verifyReplayBinding(replay, metadata, recordedHash);
        return null;
    }, [replay, actualHash, metadata, recordedHash]);

    const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
    const clearRef = useRef<number | null>(null);

    async function copyMetadata(e: React.MouseEvent) {
        e.stopPropagation();
        const ok = await copyToClipboard(metadata ?? "");
        setCopied(ok ? "ok" : "fail");
        if (clearRef.current !== null) window.clearTimeout(clearRef.current);
        clearRef.current = window.setTimeout(() => setCopied(null), 1600);
    }

    if (!binding) return null;
    const status = statusFor(binding.status);
    const expected = binding.expected ?? "";
    // The metadata payload is what a viewer would paste elsewhere to verify.
    const copyable = typeof metadata === "string" && metadata.trim().length > 0;

    if (variant === "compact") {
        return (
            <span
                title={compactTitle(binding.status, binding.actual, expected, binding.notes)}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: typography.fontFamilyMono,
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    color: status.color,
                    whiteSpace: "nowrap",
                }}
            >
                <span aria-hidden="true">{status.symbol}</span>
                {status.short}
            </span>
        );
    }

    return (
        <div
            style={{
                width: "100%",
                border: `1px solid ${status.color}44`,
                borderRadius: radius.md,
                background: `${status.color}0d`,
                padding: `${spacing.sm}px ${spacing.md}px`,
                display: "flex",
                flexDirection: "column",
                gap: 4,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                <span style={{ fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.12em" }}>
                    SCORE METADATA
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: spacing.xs }}>
                    <span
                        style={{
                            fontSize: typography.size.xs,
                            fontWeight: typography.weight.bold,
                            letterSpacing: "0.08em",
                            color: status.color,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {status.symbol} {status.label}
                    </span>
                    {copyable && (
                        <button
                            type="button"
                            onClick={copyMetadata}
                            aria-label="Copy score metadata"
                            title="Copy score metadata"
                            style={{
                                padding: "0 4px",
                                border: `1px solid ${colors.border.default}`,
                                borderRadius: radius.sm,
                                background: copied === "ok" ? "rgba(34,197,94,0.18)" : "transparent",
                                color: copied === "fail"
                                    ? colors.status.error
                                    : copied === "ok" ? colors.status.success : colors.text.muted,
                                fontFamily: typography.fontFamilyMono,
                                fontSize: typography.size.xs,
                                lineHeight: "16px",
                                cursor: "pointer",
                            }}
                        >
                            {copied === "ok" ? "✓" : copied === "fail" ? "!" : "⧉"}
                        </button>
                    )}
                </span>
            </div>

            {binding.status === "mismatch" ? (
                <>
                    <HashLine label="replay" value={binding.actual} />
                    <HashLine label="metadata" value={expected} />
                </>
            ) : (
                <HashLine label="replay hash" value={binding.actual} />
            )}

            {binding.status === "unavailable" && (
                <span style={{ fontSize: typography.size.xs, color: colors.text.secondary }}>
                    Nothing to compare — no signed score record exists for this run (practice runs
                    are not submitted). The hash above is what was recorded for this replay.
                </span>
            )}

            {binding.notes.map((note) => (
                <span key={note} style={{ fontSize: typography.size.xs, color: colors.status.warning }}>
                    ⚠ {note}
                </span>
            ))}
        </div>
    );
}

function compactTitle(status: string, actual: string, expected: string, notes: string[]): string {
    const lines: string[] = [];
    if (status === "match") lines.push(`Replay hash matches the signed score metadata.\n${actual}`);
    else if (status === "mismatch") lines.push(`Replay hash does NOT match the signed score metadata.\nreplay: ${actual}\nmetadata: ${expected}`);
    else lines.push(`Nothing to compare — this run has no signed score record.\nreplay hash: ${actual}`);
    if (notes.length) lines.push(...notes.map((n) => `⚠ ${n}`));
    return lines.join("\n");
}

function HashLine(props: { label: string; value: string }) {
    const full = isAuditHash(props.value) ? props.value : undefined;
    return (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md }}>
            <span style={{ fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.1em" }}>
                {props.label}
            </span>
            <span
                title={full}
                style={{
                    fontFamily: typography.fontFamilyMono,
                    fontSize: typography.size.sm,
                    color: colors.text.primary,
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "right",
                    wordBreak: "break-all",
                }}
            >
                {shortHash(props.value, 10)}
            </span>
        </div>
    );
}
