import React, { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button, Card } from "./index";
import { ShareCard } from "./ShareCard";
import { formatGameScore } from "@/utils/score-format";
import { getRandomTaunt } from "@/model/kamikaze";
import { getAppConfig } from "@/config/app-config";
import { getRunVerdict, type RunVerdict, type VerdictDifficulty } from "@/config/run-verdict";
import type { ProgressUpdate } from "@/config/progression";
import type { ChallengeInvite } from "@/utils/challenge-link";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  score: number;
  isPractice: boolean;
  kamikaze?: boolean;
  aiDifficulty?: string;
  worldId?: string;
  tournamentName?: string;
  isNewBest?: boolean;
  /** XP/rank/streak update from this run (meta-progression). */
  progress?: ProgressUpdate | null;
  /** Verdict of an accepted friend challenge, if this run was one. */
  challengeOutcome?: { invite: ChallengeInvite; beat: boolean } | null;
  playerName?: string;
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
  const chainLabel = useMemo(() => {
    try {
      const cfg = getAppConfig();
      return cfg.chain.chainName ?? `Chain ${cfg.chain.chainId}`;
    } catch {
      return "Polygon";
    }
  }, []);
  const verdict = useMemo<RunVerdict>(() => {
    const difficulty: VerdictDifficulty =
      props.aiDifficulty === "easy" || props.aiDifficulty === "hard" ? props.aiDifficulty : "medium";
    return getRunVerdict(kamikaze, props.score, difficulty);
  }, [kamikaze, props.score, props.aiDifficulty]);

  if (showShare) {
    return (
      <ShareCard
        score={props.score}
        worldId={props.worldId || ""}
        tournamentName={props.tournamentName}
        kamikaze={kamikaze}
        aiDifficulty={props.aiDifficulty}
        taunt={taunt}
        playerName={props.playerName}
        rankKanji={props.progress?.rank.kanji}
        rankName={props.progress?.rank.name}
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

          {/* Run verdict: an earned, on-theme grade reacting to performance. */}
          <div
            style={{
              marginTop: spacing.md,
              display: "inline-flex",
              alignItems: "center",
              gap: spacing.md,
              padding: `${spacing.sm}px ${spacing.lg}px`,
              borderRadius: radius.md,
              border: "1px solid rgba(212,160,23,0.4)",
              background: "linear-gradient(135deg, rgba(212,160,23,0.12), rgba(227,66,52,0.08))",
            }}
          >
            <div
              aria-hidden
              style={{
                fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
                fontSize: 34,
                lineHeight: 1,
                color: "#fbbf24",
                textShadow: "0 0 14px rgba(212,160,23,0.6)",
              }}
            >
              {verdict.kanji}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: spacing.xs }}>
                <span style={{ fontSize: typography.size["2xl"], fontWeight: typography.weight.bold, color: colors.text.primary }}>
                  {verdict.grade}
                </span>
                <span style={{ fontSize: typography.size.xs, letterSpacing: "0.12em", color: colors.text.muted, textTransform: "uppercase" }}>
                  Rank
                </span>
              </div>
              <div style={{ fontSize: typography.size.xs, color: colors.text.secondary, fontStyle: "italic" }}>
                {verdict.line}
              </div>
            </div>
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

        {props.challengeOutcome && (
          <div style={{
            padding: `${spacing.md}px ${spacing.lg}px`,
            borderRadius: radius.md,
            border: `1px solid ${props.challengeOutcome.beat ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)"}`,
            background: props.challengeOutcome.beat ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.08)",
            textAlign: "center",
            fontSize: typography.size.sm,
            fontWeight: typography.weight.semibold,
            color: props.challengeOutcome.beat ? "#4ade80" : "#f87171",
          }}>
            {props.challengeOutcome.beat
              ? `⚔️ CHALLENGE WON — you beat ${props.challengeOutcome.invite.name ?? "your friend"}'s ${formatGameScore(props.challengeOutcome.invite.score, props.challengeOutcome.invite.mode === "kamikaze")}!`
              : `${props.challengeOutcome.invite.name ?? "Your friend"}'s ${formatGameScore(props.challengeOutcome.invite.score, props.challengeOutcome.invite.mode === "kamikaze")} stands. Rematch?`}
          </div>
        )}

        {props.progress && props.progress.gains.length > 0 && (
          <Card padding={spacing.lg}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <div style={{ fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.1em" }}>XP EARNED</div>
              <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: "#fbbf24" }}>
                +{props.progress.totalGained} XP
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {props.progress.gains.map((g) => (
                <div key={g.label} style={{ display: "flex", justifyContent: "space-between", fontSize: typography.size.sm }}>
                  <span style={{ color: colors.text.secondary }}>{g.label}</span>
                  <span style={{ color: colors.text.primary }}>+{g.xp}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${colors.border.default}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: typography.size.sm }}>
              <span style={{ color: colors.text.secondary }}>
                {props.progress.rank.kanji} {props.progress.rank.name} · Lv {props.progress.level}
              </span>
              {props.progress.leveledUp && (
                <span style={{
                  padding: `2px ${spacing.sm}px`,
                  borderRadius: radius.full,
                  background: "linear-gradient(135deg, rgba(212,160,23,0.35), rgba(227,66,52,0.3))",
                  border: "1px solid rgba(212,160,23,0.6)",
                  color: "#fbbf24",
                  fontWeight: typography.weight.bold,
                  fontSize: typography.size.xs,
                  letterSpacing: "0.08em",
                }}>
                  RANK UP{props.progress.rank !== props.progress.previousRank ? ` — ${props.progress.rank.name.toUpperCase()}` : ""}
                </span>
              )}
            </div>
          </Card>
        )}

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
            {chainLabel} · Prizes via TournamentManager
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
