import React from "react";
import { Modal } from "./Modal";

export function CelebrationOverlay(props: {
  score: number;
  isPractice: boolean;
  onDismiss: () => void;
  onPlayAgain: () => void;
  onPlayTournament: () => void;
  onViewLeaderboard: () => void;
}) {
  return (
    <Modal
      title="Game complete"
      onClose={props.onDismiss}
      footer={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={props.onPlayAgain}>Play again</button>
          <button onClick={props.onPlayTournament}>Play tournament</button>
          <button onClick={props.onViewLeaderboard}>View leaderboard</button>
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

