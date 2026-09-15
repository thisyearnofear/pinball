import React, { useEffect, useState } from "react";
import { describeSeedProvenance } from "@/utils/seed-provenance";
import { peekNextSeedSource, prefetchQuantumSeeds } from "@/services/quantum-seed";

import { colors, radius, spacing, typography } from "@/theme/tokens";

/**
 * Proof-of-provenance badge: shows where a run's RNG seed came from.
 *
 * Renders only the recorded value — it never claims a quantum seed changes the
 * physics or the score. See docs/QUANTUM_SEEDS.md.
 */
export function SeedBadge(props: {
    /** Recorded provenance (replay digest value). */
    source?: string | null;
    /** Small caption under the chip (e.g. "seed source"). */
    caption?: string;
    size?: "sm" | "md";
}) {
    const p = describeSeedProvenance(props.source);
    const small = props.size !== "md";

    return (
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span
                title={`RNG seed: ${p.phrase}`}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: spacing.xs,
                    padding: small ? "2px 10px" : "4px 12px",
                    borderRadius: radius.full,
                    border: `1px solid ${p.color}66`,
                    background: `${p.color}14`,
                    color: p.color,
                    fontSize: small ? typography.size.xs : typography.size.sm,
                    fontWeight: typography.weight.bold,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                }}
            >
                <span aria-hidden="true" style={{ fontSize: "1.05em", lineHeight: 1 }}>{p.symbol}</span>
                {p.label}
            </span>
            {props.caption && (
                <span style={{ fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.06em" }}>
                    {props.caption}
                </span>
            )}
        </div>
    );
}

/**
 * Provenance the next run will start with. Warms the seed buffer on mount and
 * re-reads once a prefetch settles, so a lobby opened cold flips from
 * "device entropy" to "quantum-seeded" when the backend answers.
 */
export function useNextSeedSource(): string {
    const [source, setSource] = useState<string>(() => peekNextSeedSource());

    useEffect(() => {
        let cancelled = false;
        setSource(peekNextSeedSource());
        void prefetchQuantumSeeds().then(() => {
            if (!cancelled) setSource(peekNextSeedSource());
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return source;
}

/** Lobby badge — the provenance the player's NEXT run will use. */
export function NextSeedBadge(props: { caption?: string; size?: "sm" | "md" }) {
    const source = useNextSeedSource();
    return <SeedBadge source={source} caption={props.caption} size={props.size} />;
}
