import React from "react";
import { colors, spacing, typography, radius } from "@/theme/tokens";

/**
 * Machine Stability Meter — a kamikaze-HUD tension gauge.
 *
 * Shows how close the ball is to the drain (0% = ball at top, 100% = at drain).
 * The bar color shifts from green (safe) → amber → red (danger) as the ball
 * approaches the drain, giving the player a visceral sense of how close they
 * are to winning (or how close the machine is to losing).
 *
 * Core Principles:
 * - PERFORMANT: pure presentational component; parent updates the value.
 * - CLEAN: no side effects, no internal state.
 */
export function StabilityMeter({
  /** 0–1, how close the ball is to the drain */
  value,
  /** When true, the machine has a force-field or save active (pulses blue) */
  machineSaving = false,
}: {
  value: number;
  machineSaving?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const displayPct = Math.round(pct * 100);

  // Color interpolation: green → amber → red
  let barColor: string;
  if (machineSaving) {
    barColor = colors.status.info;
  } else if (pct < 0.4) {
    barColor = colors.status.success;
  } else if (pct < 0.7) {
    barColor = colors.status.warning;
  } else {
    barColor = colors.status.error;
  }

  const label = machineSaving
    ? "MACHINE DEFENDING"
    : pct > 0.8
      ? "DRAIN IMMINENT"
      : pct > 0.5
        ? "BALL SLIPPING"
        : "MACHINE STABLE";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 160,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10,
          fontWeight: typography.weight.bold,
          letterSpacing: "0.08em",
          color: barColor,
          textShadow: machineSaving ? `0 0 8px ${barColor}` : "none",
          animation: machineSaving ? "stabPulse 0.6s ease-in-out infinite" : "none",
        }}
      >
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{displayPct}%</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: radius.full,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          border: `1px solid ${colors.border.subtle}`,
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${displayPct}%`,
            background: barColor,
            borderRadius: radius.full,
            transition: "width 100ms linear, background 200ms ease",
            boxShadow: `0 0 8px ${barColor}`,
          }}
        />
        {/* Tick marks at 25/50/75% */}
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(0,0,0,0.3)",
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes stabPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
