import React, { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button, Card } from "./index";
import { ShareCard } from "./ShareCard";
import { formatGameScore } from "@/utils/score-format";
import { getRandomTaunt } from "@/model/kamikaze";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  score: number;
  isPractice: boolean;
  kamikaze?: boolean;
  aiDifficulty?: string;
  worldId?: string;
  tournamentName?: string;
  isNewBest?: boolean;
  onDismiss: () => void;
  onPlayAgain: () => void;
  onPlayTournament: () => void;
  onViewLeaderboard: () => void;
  onWatchReplay?: () => void;
  onBackToLobby?: () => void;
};

export function CelebrationOverlay(props: Props) {
  const kamikaze = Boolean(props.kamikaze);
  const [showShare, setShowShare] = useState(false);
  const taunt = useMemo(() => (kamikaze ? getRandomTaunt(true) : undefined), [kamikaze]);

  if (showShare) {
    return (
      <ShareCard
        score={props.score}
        worldId={props.worldId || ""}
        tournamentName={props.tournamentName}
        kamikaze={kamikaze}
        aiDifficulty={props.aiDifficulty}
        taunt={taunt}
        onDismiss={() => setShowShare(false)}
      />
    );
  }

  return (
    <Modal title="Game complete" onClose={props.onDismiss}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: typography.size["4xl"], fontWeight: typography.weight.bold, color: colors.text.primary }}>
            {formatGameScore(props.score, kamikaze)}
          </div>
          <div style={{ fontSize: typography.size.md, color: colors.text.secondary, marginTop: spacing.xs }}>
            {kamikaze ? "Best drain time this run." : ""}
            {kamikaze ? " " : ""}
            {props.isPractice ? "Practice run complete." : "Tournament run complete."}
          </div>
          {props.isNewBest && (
            <div style={{
              marginTop: spacing.sm,
              display: "inline-flex",
              alignItems: "center",
              gap: spacing.xs,
              padding: `${spacing.xs}px ${spacing.md}px`,
              borderRadius: radius.full,
              background: "linear-gradient(135deg, rgba(227, 66, 52, 0.25), rgba(212, 160, 23, 0.25))",
              border: "1px solid rgba(212, 160, 23, 0.5)",
              fontSize: typography.size.sm,
              fontWeight: typography.weight.bold,
              letterSpacing: "0.08em",
              color: "#fbbf24",
            }}>
              🌸 NEW DAILY BEST
            </div>
          )}
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
                <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>{kamikaze ? "Drain time" : "Score"}</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.accent.primary }}>
                  {formatGameScore(props.score, kamikaze)}
                </div>
              </div>
            </div>
          </Card>
        )}

        {!props.isPractice && (
          <div style={{ textAlign: "center", fontSize: typography.size.sm, color: colors.text.muted, padding: `${spacing.xs}px 0` }}>
            Polygon Amoy · Prizes via TournamentManager
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
          <Button fullWidth onClick={props.onPlayAgain}>
            Play Again
          </Button>
          <Button fullWidth variant="secondary" onClick={() => setShowShare(true)}>
            Share Result
          </Button>
          {props.onWatchReplay && (
            <Button fullWidth variant="secondary" onClick={props.onWatchReplay}>
              Watch Replay
            </Button>
          )}
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
