import React from "react";

/**
 * KanjiWatermark — 神風 ("divine wind", the origin of the word kamikaze).
 *
 * Rendered as a large, low-opacity ink-style watermark behind the play area
 * in Kamikaze mode, plus a small caption. Pure decoration (aria-hidden),
 * pointer-events: none so it never intercepts input.
 *
 * Anchored on the older natural-force meaning — the divine wind that carries
 * the falling blossom — not any military imagery.
 */
export function KanjiWatermark({ size = "table" }: { size?: "table" | "lobby" }) {
  const isTable = size === "table";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 0,
        userSelect: "none",
      }}
    >
      <div
        style={{
          fontSize: isTable ? "clamp(96px, 22vw, 260px)" : "clamp(56px, 10vw, 120px)",
          lineHeight: 1,
          fontWeight: 700,
          color: "rgba(227, 66, 52, 0.08)",
          textShadow: "0 0 40px rgba(227, 66, 52, 0.06)",
          letterSpacing: "0.05em",
          fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'MS Mincho', 'Noto Serif JP', serif",
          transform: isTable ? "rotate(-4deg)" : "none",
          animation: "kanjiBreath 6s ease-in-out infinite",
        }}
      >
        神風
      </div>
      <div
        style={{
          marginTop: isTable ? 10 : 4,
          fontSize: isTable ? 13 : 10,
          letterSpacing: "0.35em",
          textTransform: "uppercase",
          color: "rgba(212, 160, 23, 0.28)",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {isTable ? "divine wind" : "kamikaze"}
      </div>
      <style>{`
        @keyframes kanjiBreath {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
