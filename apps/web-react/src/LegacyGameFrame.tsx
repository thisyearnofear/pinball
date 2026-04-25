import React from "react";

const LEGACY_URL =
  (import.meta.env.VITE_LEGACY_GAME_URL as string | undefined) ?? "http://localhost:5173/";

export default function LegacyGameFrame() {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
        Legacy game (temporary) — will be migrated into React.
      </div>
      <iframe
        title="Legacy Pinball Game"
        src={LEGACY_URL}
        style={{
          width: "100%",
          height: "75vh",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
        }}
      />
    </div>
  );
}

