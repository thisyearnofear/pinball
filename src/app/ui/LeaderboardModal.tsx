import React from "react";
import { Modal } from "./Modal";

export function LeaderboardModal(props: { onClose: () => void; rows: { address: string; score: number }[] }) {
  return (
    <Modal title="Leaderboard" onClose={props.onClose}>
      {props.rows.length ? (
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          {props.rows.slice(0, 50).map((r) => (
            <li key={r.address}>
              {r.address} — {r.score}
            </li>
          ))}
        </ol>
      ) : (
        <div style={{ opacity: 0.85 }}>No scores yet (or not loaded).</div>
      )}
    </Modal>
  );
}

