import React from "react";
import { colors, typography } from "@/theme/tokens";

type Props = {
  text: string;
  size?: "sm" | "md" | "lg";
  color?: string;
  glowColor?: string;
};

const sizes = {
  sm: { fontSize: typography.size.xl, glowSize: 4 },
  md: { fontSize: typography.size["3xl"], glowSize: 8 },
  lg: { fontSize: 48, glowSize: 12 },
};

export function NeonTitle({ text, size = "md", color = "#6366f1", glowColor }: Props) {
  const { fontSize, glowSize } = sizes[size];
  const glow = glowColor || color;

  return (
    <div
      style={{
        textAlign: "center",
        position: "relative",
      }}
    >
      {/* Glow layers */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          fontSize,
          fontWeight: typography.weight.bold,
          color: "transparent",
          textShadow: `
            0 0 ${glowSize}px ${glow},
            0 0 ${glowSize * 2}px ${glow},
            0 0 ${glowSize * 4}px ${glow},
            0 0 ${glowSize * 8}px ${glow}
          `,
          filter: "blur(2px)",
          animation: "neonPulse 3s ease-in-out infinite",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        {text}
      </div>

      {/* Main text */}
      <div
        style={{
          position: "relative",
          fontSize,
          fontWeight: typography.weight.bold,
          color: "#fff",
          textShadow: `
            0 0 2px ${glow},
            0 0 4px ${glow},
            0 0 8px ${glow}
          `,
          letterSpacing: "0.05em",
        }}
      >
        {text}
      </div>

      <style>{`
        @keyframes neonPulse {
          0%, 100% { opacity: 1; filter: blur(2px); }
          50% { opacity: 0.85; filter: blur(3px); }
        }
      `}</style>
    </div>
  );
}
