import React from "react";
import { Modal, Skeleton } from "./index";
import { shortenAddress } from "@/utils/address";
import { formatGameScore } from "@/utils/score-format";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Row = { address: string; score: number };

type Props = {
  onClose: () => void;
  rows: Row[];
  playerAddress?: string;
  loading?: boolean;
  /** Kamikaze mode: lower score (drain time in ms) wins; scores shown as seconds */
  inverted?: boolean;
};

const rankBadges = ["🥇", "🥈", "🥉"];

export function LeaderboardModal(props: Props) {
  const inverted = Boolean(props.inverted);
  const sorted = React.useMemo(() => {
    const rows = inverted ? props.rows.filter((r) => r.score > 0) : props.rows;
    return [...rows]
      .sort((a, b) => (inverted ? a.score - b.score : b.score - a.score))
      .slice(0, 50);
  }, [props.rows, inverted]);

  if (props.loading) {
    return (
      <Modal title="Leaderboard" onClose={props.onClose} size="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.md,
                padding: `${spacing.sm}px ${spacing.md}px`,
              }}
            >
              <Skeleton width={32} height={20} />
              <Skeleton width="60%" height={14} />
              <div style={{ flex: 1 }} />
              <Skeleton width={60} height={18} />
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Leaderboard" onClose={props.onClose} size="lg">
      {sorted.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
          {sorted.map((r, i) => {
            const isMe = props.playerAddress && r.address.toLowerCase() === props.playerAddress.toLowerCase();
            return (
              <div
                key={r.address}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.md,
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radius.md,
                  background: isMe ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  border: isMe ? `1px solid ${colors.accent.primary}` : "1px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{
                  width: 32,
                  textAlign: "center",
                  fontSize: i < 3 ? typography.size.lg : typography.size.sm,
                  fontWeight: typography.weight.bold,
                  color: i < 3 ? colors.text.primary : colors.text.muted,
                }}>
                  {i < 3 ? rankBadges[i] : `#${i + 1}`}
                </div>
                <div style={{
                  flex: 1,
                  fontSize: typography.size.sm,
                  fontFamily: typography.fontFamilyMono,
                  color: isMe ? colors.accent.primary : colors.text.secondary,
                }}>
                  {shortenAddress(r.address)}
                  {isMe && <span style={{ marginLeft: spacing.xs, fontSize: typography.size.xs }}>(you)</span>}
                </div>
                <div style={{
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.semibold,
                  color: colors.text.primary,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {formatGameScore(r.score, inverted)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          textAlign: "center",
          padding: spacing['2xl'],
          color: colors.text.muted,
          fontSize: typography.size.md,
        }}>
          No scores yet. Be the first to play!
        </div>
      )}
    </Modal>
  );
}
