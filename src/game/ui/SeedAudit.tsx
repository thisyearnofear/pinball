import React, { useRef, useState } from "react";
import { describeSeedProvenance } from "@/utils/seed-provenance";
import {
    formatSeedAuditSummary,
    hasSeedAudit,
    isAuditHash,
    seedFingerprint,
    shortHash,
} from "@/utils/seed-audit";
import { copyToClipboard } from "@/utils/clipboard";

import { colors, radius, spacing, typography } from "@/theme/tokens";

type Props = {
    /** The run's recorded RNG seed. */
    seed?: number | null;
    /** Recorded provenance (qrng/csprng/local). */
    seedSource?: string | null;
    /** keccak256 of the encoded replay JSON (binds the replay to the signed score). */
    replayHash?: string | null;
    /** "full" for a panel (replay viewer); "compact" for a one-line PiP footer. */
    variant?: "full" | "compact";
};

type CopyState = { key: string; ok: boolean } | null;

/**
 * Audit readout for a rival's run: where the seed came from, the seed itself, a
 * fingerprint derived from it, and — when known — the replay hash that ties the
 * replay to the signed score.
 *
 * Every value is tap-to-copy so a viewer can take it elsewhere and check it: the
 * full panel copies one field at a time, the compact ghost-race line copies a
 * paste-ready summary of everything it can. Pure presentation over
 * `seed-provenance` + `seed-audit`; copy is deliberately literal (this is a
 * derived fingerprint, not a fairness proof).
 */
export function SeedAudit({ seed, seedSource, replayHash, variant = "full" }: Props) {
    const provenance = describeSeedProvenance(seedSource);
    const hasSeed = typeof seed === "number" && Number.isFinite(seed);
    const fingerprint = hasSeed ? seedFingerprint(seed as number) : null;
    const hasReplayHash = isAuditHash(replayHash);
    const [copyState, setCopyState] = useState<CopyState>(null);
    const clearRef = useRef<number | null>(null);

    async function copy(key: string, value: string, e?: React.MouseEvent) {
        // The ghost PiP sits inside the playfield's click handler (tap-to-nudge):
        // don't let an audit tap register as a game input.
        e?.stopPropagation();
        const ok = await copyToClipboard(value);
        setCopyState({ key, ok });
        if (clearRef.current !== null) window.clearTimeout(clearRef.current);
        clearRef.current = window.setTimeout(() => setCopyState(null), 1600);
    }

    // Nothing auditable to show (legacy/practice digest with no recorded seed).
    if (!hasSeedAudit(seed, replayHash)) return null;

    /** null = not this row; true/false = copy result for this row. */
    const flashed = (key: string) => (copyState?.key === key ? copyState.ok : null);

    if (variant === "compact") {
        const state = flashed("summary");
        const short = fingerprint ? shortHash(fingerprint, 6) : shortHash(replayHash, 6);
        return (
            <button
                type="button"
                onClick={(e) => copy("summary", formatSeedAuditSummary({ seed, seedSource, replayHash }), e)}
                title={`${auditTitle({ seed, fingerprint, replayHash, label: provenance.phrase })}\n\nTap to copy`}
                aria-label="Copy seed audit"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "1px 4px",
                    border: "none",
                    borderRadius: radius.sm,
                    background: state === true ? "rgba(34,197,94,0.2)" : "transparent",
                    cursor: "pointer",
                    fontFamily: typography.fontFamilyMono,
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    color: state === false ? colors.status.error : provenance.color,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                <span aria-hidden="true">{state === true ? "✓" : state === false ? "!" : provenance.symbol}</span>
                {state === true ? "copied" : short}
            </button>
        );
    }

    return (
        <div
            style={{
                width: "100%",
                border: `1px solid ${provenance.color}33`,
                borderRadius: radius.md,
                background: "rgba(255,255,255,0.03)",
                padding: `${spacing.sm}px ${spacing.md}px`,
                display: "flex",
                flexDirection: "column",
                gap: 6,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                <span style={{ fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.12em" }}>
                    SEED AUDIT
                </span>
                <span
                    style={{
                        fontSize: typography.size.xs,
                        fontWeight: typography.weight.bold,
                        letterSpacing: "0.08em",
                        color: provenance.color,
                        whiteSpace: "nowrap",
                    }}
                >
                    {provenance.symbol} {provenance.label}
                </span>
            </div>

            {hasSeed && (
                <AuditRow
                    label="SEED"
                    value={String(seed)}
                    mono
                    copyKey="seed"
                    copyValue={String(seed)}
                    copied={flashed("seed")}
                    onCopy={copy}
                />
            )}
            {fingerprint && (
                <AuditRow
                    label="SEED HASH"
                    value={shortHash(fingerprint, 10)}
                    title={fingerprint}
                    mono
                    copyKey="seedHash"
                    copyValue={fingerprint}
                    copied={flashed("seedHash")}
                    onCopy={copy}
                />
            )}
            {hasReplayHash && (
                <AuditRow
                    label="REPLAY HASH"
                    value={shortHash(replayHash ?? "", 10)}
                    title={replayHash ?? undefined}
                    mono
                    copyKey="replayHash"
                    copyValue={replayHash ?? ""}
                    copied={flashed("replayHash")}
                    onCopy={copy}
                />
            )}
        </div>
    );
}

function AuditRow(props: {
    label: string;
    value: string;
    title?: string;
    mono?: boolean;
    /** Stable key used for the copied/failed flash state. */
    copyKey: string;
    copyValue: string;
    copied: boolean | null;
    onCopy: (key: string, value: string, e?: React.MouseEvent) => void;
}) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm }}>
            <span style={{ fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.1em" }}>
                {props.label}
            </span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: spacing.xs, minWidth: 0 }}>
                <span
                    title={props.title}
                    style={{
                        fontFamily: props.mono ? typography.fontFamilyMono : undefined,
                        fontSize: typography.size.sm,
                        color: colors.text.primary,
                        fontVariantNumeric: "tabular-nums",
                        textAlign: "right",
                        wordBreak: "break-all",
                    }}
                >
                    {props.value}
                </span>
                <button
                    type="button"
                    onClick={(e) => props.onCopy(props.copyKey, props.copyValue, e)}
                    aria-label={`Copy ${props.label.toLowerCase()}`}
                    title={`Copy ${props.label.toLowerCase()}`}
                    style={{
                        flex: "0 0 auto",
                        padding: "0 4px",
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.sm,
                        background: props.copied === true ? "rgba(34,197,94,0.18)" : "transparent",
                        color: props.copied === false
                            ? colors.status.error
                            : props.copied === true ? colors.status.success : colors.text.muted,
                        fontFamily: typography.fontFamilyMono,
                        fontSize: typography.size.xs,
                        lineHeight: "16px",
                        cursor: "pointer",
                    }}
                >
                    {props.copied === true ? "✓" : props.copied === false ? "!" : "⧉"}
                </button>
            </span>
        </div>
    );
}

function auditTitle(opts: {
    seed?: number | null;
    fingerprint: string | null;
    replayHash?: string | null;
    label: string;
}): string {
    const lines = [`Seed source: ${opts.label}`];
    if (typeof opts.seed === "number") lines.push(`Seed: ${opts.seed}`);
    if (opts.fingerprint) lines.push(`Seed hash: ${opts.fingerprint}`);
    const replay = typeof opts.replayHash === "string" ? opts.replayHash : "";
    if (replay) lines.push(`Replay hash: ${replay}`);
    return lines.join("\n");
}
