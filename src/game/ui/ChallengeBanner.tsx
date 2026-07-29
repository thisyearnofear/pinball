import React from "react";
import { getWorldById } from "@/config/worlds";
import type { ChallengeInvite } from "@/utils/challenge-link";
import { formatGameScore } from "@/utils/score-format";
import { Button } from "./Button";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  invite: ChallengeInvite;
  onAccept: (invite: ChallengeInvite) => void;
  onDismiss: () => void;
};

/**
 * Inbound friend challenge: shown in the lobby when the app is opened via a
 * challenge deep link. One tap accepts and starts a run under the exact same
 * conditions (mode, world, machine difficulty).
 */
export function ChallengeBanner(props: Props) {
  const { invite } = props;
  const world = getWorldById(invite.worldId);
  const kamikaze = invite.mode === "kamikaze";
  const challenger = invite.name || "A friend";
  const target = formatGameScore(invite.score, kamikaze);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderRadius: radius.lg,
        border: "1px solid rgba(212,160,23,0.55)",
        background: "linear-gradient(135deg, rgba(212,160,23,0.14), rgba(227,66,52,0.1))",
        boxShadow: "0 0 24px rgba(212,160,23,0.15)",
      }}
    >
      <div aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>⚔️</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: "#fbbf24", letterSpacing: "0.04em" }}>
          {challenger} challenges you
        </div>
        <div style={{ fontSize: typography.size.xs, color: colors.text.secondary, marginTop: 2 }}>
          {kamikaze ? `Drain faster than ${target}` : `Score higher than ${target}`}
          {` · ${world?.name ?? invite.worldId}`}
          {kamikaze ? ` · machine on ${invite.aiDifficulty}` : ""}
        </div>
      </div>
      <Button size="sm" onClick={() => props.onAccept(invite)}>
        Accept
      </Button>
      <button
        type="button"
        aria-label="Dismiss challenge"
        onClick={props.onDismiss}
        style={{
          background: "none",
          border: "none",
          color: colors.text.muted,
          fontSize: 16,
          cursor: "pointer",
          padding: 4,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
