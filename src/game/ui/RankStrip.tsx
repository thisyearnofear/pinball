import React from "react";
import { levelProgress, rankForLevel, type PlayerProgress } from "@/config/progression";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  progress: PlayerProgress;
};

/**
 * Compact identity strip for the lobby: wind rank, level, XP bar and streak.
 * Works without a wallet — progression is local, so it is always visible and
 * gives returning players a next milestone at a glance.
 */
export function RankStrip(props: Props) {
  const { xp, currentStreak, totalRuns } = props.progress;
  const lp = levelProgress(xp);
  const rank = rankForLevel(lp.level);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.md,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.default}`,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div
        aria-hidden
        style={{
          fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
          fontSize: 26,
          color: "#d4a017",
          lineHeight: 1,
        }}
      >
        {rank.kanji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: spacing.sm }}>
          <span style={{ fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary }}>
            {rank.name}
          </span>
          <span style={{ fontSize: typography.size.xs, color: colors.text.muted }}>
            Lv {lp.level} · {totalRuns} run{totalRuns === 1 ? "" : "s"}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(lp.fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            marginTop: 4,
            height: 6,
            borderRadius: radius.full,
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(lp.fraction * 100)}%`,
              background: "linear-gradient(90deg, #d4a017, #fbbf24)",
              borderRadius: radius.full,
              transition: "width 600ms ease",
            }}
          />
        </div>
      </div>
      {currentStreak >= 2 && (
        <div
          title={`${currentStreak}-day streak`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: radius.full,
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.45)",
            fontSize: typography.size.xs,
            fontWeight: typography.weight.bold,
            color: "#fbbf24",
            whiteSpace: "nowrap",
          }}
        >
          🔥 {currentStreak}
        </div>
      )}
    </div>
  );
}
