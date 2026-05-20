import React from "react";
import { Modal } from "./Modal";
import { ShareCard } from "./ShareCard";

export function CelebrationOverlay(props: {
  score: number;
  isPractice: boolean;
  worldId?: string;
  tournamentName?: string;
  onDismiss: () => void;
  onPlayAgain: () => void;
  onPlayTournament: () => void;
  onViewLeaderboard: () => void;
  onBackToLobby?: () => void;
}) {
  const [showShare, setShowShare] = React.useState(true);

  if (showShare && props.worldId) {
    return (
      <ShareCard
        score={props.score}
        worldId={props.worldId}
        tournamentName={props.tournamentName}
        onDismiss={() => setShowShare(false)}
      />
    );
  }

  return (
    <Modal
      title="Game complete"
      onClose={props.onDismiss}
      footer={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={props.onPlayAgain}>Play again</button>
          <button onClick={props.onPlayTournament}>Play tournament</button>
          <button onClick={props.onViewLeaderboard}>View leaderboard</button>
          {props.onBackToLobby && (
            <button onClick={props.onBackToLobby}>Back to lobby</button>
          )}
        </div>
      }
    >
      <div style={{ lineHeight: 1.6 }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{props.score} pts</div>
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          {props.isPractice ? "Practice run complete." : "Tournament run complete."}
        </div>
      </div>
    </Modal>
  );
}

