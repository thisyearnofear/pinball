"use client";

import dynamic from "next/dynamic";

// Dynamically import GameScreen to avoid SSR issues with
// browser-only dependencies (matter-js, zcanvas, SparkJS)
const GameScreen = dynamic(() => import("@/game/GameScreen"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0a0a0f",
        color: "rgba(255,255,255,0.5)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Mezo Pinball
        </div>
        <div style={{ fontSize: 13 }}>Loading...</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <GameScreen />;
}
