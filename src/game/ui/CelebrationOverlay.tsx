import React from "react";
import { Modal } from "./Modal";
import { Button, Card } from "./index";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  score: number;
  isPractice: boolean;
  worldId?: string;
  tournamentName?: string;
  onDismiss: () => void;
  onPlayAgain: () => void;
  onPlayTournament: () => void;
  onViewLeaderboard: () => void;
  onBackToLobby?: () => void;
};

export function CelebrationOverlay(props: Props) {
  return (
    <Modal title="Game complete" onClose={props.onDismiss}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: typography.size["4xl"], fontWeight: typography.weight.bold, color: colors.text.primary }}>
            {props.score.toLocaleString()}
          </div>
          <div style={{ fontSize: typography.size.md, color: colors.text.secondary, marginTop: spacing.xs }}>
            {props.isPractice ? "Practice run complete." : "Tournament run complete."}
          </div>
        </div>

        {props.worldId && (
          <Card padding={spacing.lg}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>World</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
                  {props.tournamentName || "Practice"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>Score</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.accent.primary }}>
                  {props.score.toLocaleString()}
                </div>
              </div>
            </div>
          </Card>
        )}

        {!props.isPractice && (
          <div style={{ textAlign: "center", fontSize: typography.size.sm, color: colors.text.muted, padding: `${spacing.xs}px 0` }}>
            Mezo Testnet · MUSD prizes via TournamentManager
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
          <Button fullWidth onClick={props.onPlayAgain}>
            Play Again
          </Button>
          {!props.isPractice && (
            <Button fullWidth variant="secondary" onClick={props.onPlayTournament}>
              Play Tournament
            </Button>
          )}
          <Button fullWidth variant="ghost" onClick={props.onViewLeaderboard}>
            View Leaderboard
          </Button>
          {props.onBackToLobby && (
            <Button fullWidth variant="ghost" onClick={props.onBackToLobby}>
              Back to Lobby
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
