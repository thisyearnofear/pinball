import React from "react";
import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  score: number;
  balls?: number;
  maxBalls?: number;
  tilt?: boolean;
  match?: number;
  credit?: number;
  compact?: boolean;
};

function LEDNumber({ value, digits = 7, color = "#ff3333" }: { value: number; digits?: number; color?: string }) {
  const formatted = String(value).padStart(digits, "0");

  return (
    <div
      style={{
        fontFamily: "'Courier New', monospace",
        fontSize: digits > 6 ? "2rem" : "1.2rem",
        fontWeight: "bold",
        color,
        textShadow: `0 0 4px ${color}, 0 0 8px ${color}`,
        letterSpacing: "0.1em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {formatted}
    </div>
  );
}

function BallIndicator({ active, color }: { active: boolean; color: string }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: active ? color : "rgba(255, 255, 255, 0.1)",
        boxShadow: active ? `0 0 6px ${color}, 0 0 12px ${color}` : "none",
        border: `1px solid ${active ? color : colors.border.subtle}`,
        transition: "all 0.2s ease",
      }}
    />
  );
}

export function PinballHUD({
  score,
  balls = 3,
  maxBalls = 3,
  tilt = false,
  match,
  credit,
  compact = false,
}: Props) {
  const ledColor = tilt ? "#ff4444" : "#ff6600";

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.md,
          padding: `${spacing.xs}px ${spacing.sm}px`,
          background: "rgba(0, 0, 0, 0.6)",
          borderRadius: radius.md,
          border: `1px solid ${colors.border.subtle}`,
        }}
      >
        <LEDNumber value={score} digits={6} color={ledColor} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: maxBalls }).map((_, i) => (
            <BallIndicator key={i} active={i < balls} color={ledColor} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.sm,
        padding: spacing.lg,
        background: "rgba(0, 0, 0, 0.8)",
        borderRadius: radius.lg,
        border: `2px solid ${colors.border.emphasis}`,
        boxShadow: `0 0 20px rgba(0, 0, 0, 0.5), inset 0 0 30px rgba(0, 0, 0, 0.3)`,
      }}
    >
      {/* Score display */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: typography.size.xs,
            color: colors.text.muted,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: spacing.xs,
          }}
        >
          Score
        </div>
        <LEDNumber value={score} digits={8} color={ledColor} />
      </div>

      {/* Ball indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: spacing.sm }}>
        {Array.from({ length: maxBalls }).map((_, i) => (
          <BallIndicator key={i} active={i < balls} color={ledColor} />
        ))}
      </div>

      {/* Match and credits */}
      {(match !== undefined || credit !== undefined) && (
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: spacing.xs }}>
          {match !== undefined && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>Match</div>
              <LEDNumber value={match} digits={2} color="#33ff33" />
            </div>
          )}
          {credit !== undefined && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>Credits</div>
              <LEDNumber value={credit} digits={2} color="#33ff33" />
            </div>
          )}
        </div>
      )}

      {/* Tilt warning */}
      {tilt && (
        <div
          style={{
            textAlign: "center",
            fontSize: typography.size.lg,
            fontWeight: typography.weight.bold,
            color: "#ff0000",
            textShadow: "0 0 8px #ff0000, 0 0 16px #ff0000",
            animation: "tiltFlash 0.5s ease-in-out infinite",
            letterSpacing: "0.2em",
          }}
        >
          TILT
        </div>
      )}

      <style>{`
        @keyframes tiltFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
