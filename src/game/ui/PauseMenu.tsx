import React from "react";
import { useIsSmallScreen } from "@/hooks/use-media-query";
import { Button } from "./Button";
import { formatGameScore } from "@/utils/score-format";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  score: number;
  kamikaze?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onSettings?: () => void;
  onQuitToLobby: () => void;
};

export function PauseMenu(props: Props) {
  const isSmall = useIsSmallScreen();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: colors.background.overlay,
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: isSmall ? "flex-end" : "center",
        justifyContent: "center",
        padding: isSmall ? 0 : spacing.lg,
        zIndex: 200,
        animation: "fadeIn 150ms ease",
      }}
    >
      <div
        style={{
          width: isSmall ? "100%" : "min(380px, 100%)",
          background: colors.background.surface,
          border: isSmall ? "none" : `1px solid ${colors.border.default}`,
          borderRadius: isSmall ? `${radius.xl}px ${radius.xl}px 0 0` : radius.xl,
          padding: isSmall ? `${spacing.xl}px ${spacing.lg}px ${spacing["2xl"]}px` : spacing["2xl"],
          boxShadow: isSmall ? "none" : "0 8px 32px rgba(0, 0, 0, 0.5)",
          animation: isSmall ? "slideUpMobile 250ms ease" : "slideUp 200ms ease",
        }}
      >
        {isSmall && (
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: colors.border.emphasis,
            margin: "0 auto",
            marginBottom: spacing.lg,
          }} />
        )}

        <div style={{ textAlign: "center", marginBottom: spacing["2xl"] }}>
          <h2 style={{
            margin: 0,
            fontSize: isSmall ? typography.size.xl : typography.size["2xl"],
            fontWeight: typography.weight.bold,
            background: colors.accent.gradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Paused
          </h2>
          <div style={{ marginTop: spacing.sm, fontSize: typography.size.lg, color: colors.text.muted }}>
            {props.kamikaze ? formatGameScore(props.score, true) : `${props.score.toLocaleString()} pts`}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
          <Button fullWidth size="lg" onClick={props.onResume} style={{ minHeight: isSmall ? 52 : 44 }}>
            Resume
          </Button>
          <Button fullWidth variant="secondary" size="lg" onClick={props.onRestart} style={{ minHeight: isSmall ? 52 : 44 }}>
            Restart
          </Button>
          {props.onSettings && (
            <Button fullWidth variant="ghost" onClick={props.onSettings} style={{ minHeight: isSmall ? 52 : 44 }}>
              Settings
            </Button>
          )}
          <Button fullWidth variant="ghost" onClick={props.onQuitToLobby} style={{ minHeight: isSmall ? 52 : 44 }}>
            Quit to Lobby
          </Button>
        </div>

        <div style={{ marginTop: spacing.xl, fontSize: typography.size.xs, color: colors.text.muted, textAlign: "center" }}>
          Press Esc to resume
        </div>
      </div>
    </div>
  );
}
