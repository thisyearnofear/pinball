import React from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { Card } from "./Card";
import { formatGameScore } from "@/utils/score-format";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  address: string | null;
  stats: {
    gamesPlayed: number;
    bestScore: number;
    bestDrainMs: number;
    tournamentsEntered: number;
  };
};

export function PlayerCard(props: Props) {
  if (!props.address) return null;

  const shortAddr = `${props.address.slice(0, 6)}...${props.address.slice(-4)}`;

  return (
    <Card padding={spacing.lg}>
      <div style={{ display: "flex", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg }}>
        <PlayerAvatar address={props.address} size={48} />
        <div>
          <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
            Player
          </div>
          <div style={{ fontSize: typography.size.sm, fontFamily: typography.fontFamilyMono, color: colors.text.muted }}>
            {shortAddr}
          </div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: spacing.md,
      }}>
        <StatBlock label="Games" value={props.stats.gamesPlayed.toString()} />
        <StatBlock label="Best Drain" value={props.stats.bestDrainMs > 0 ? formatGameScore(props.stats.bestDrainMs, true) : "—"} />
        <StatBlock label="Best Score" value={props.stats.bestScore > 0 ? formatGameScore(props.stats.bestScore, false) : "—"} />
        <StatBlock label="Tournaments" value={props.stats.tournamentsEntered.toString()} />
      </div>
    </Card>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: spacing.sm,
      background: "rgba(255, 255, 255, 0.03)",
      borderRadius: radius.md,
      textAlign: "center",
    }}>
      <div style={{ fontSize: typography.size.xs, color: colors.text.muted, marginBottom: spacing.xs }}>
        {label}
      </div>
      <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
        {value}
      </div>
    </div>
  );
}
