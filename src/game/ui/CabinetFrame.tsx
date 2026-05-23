import React from "react";
import { colors, radius } from "@/theme/tokens";

type Props = {
  children: React.ReactNode;
  accentColor?: string;
};

export function CabinetFrame({ children, accentColor = "#6366f1" }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, #0a0a0f 0%, #050508 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient background glow */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "80vw",
          height: "60vh",
          background: `radial-gradient(ellipse at center, ${accentColor}15 0%, transparent 70%)`,
          pointerEvents: "none",
          filter: "blur(40px)",
        }}
      />

      {/* Cabinet body */}
      <div
        style={{
          position: "relative",
          width: "min(100%, 480px)",
          maxWidth: "100%",
          background: "linear-gradient(180deg, #1a1a24 0%, #0f0f16 100%)",
          borderRadius: "24px 24px 12px 12px",
          border: `2px solid ${colors.border.emphasis}`,
          boxShadow: `
            0 0 40px rgba(0, 0, 0, 0.8),
            0 0 80px ${accentColor}20,
            inset 0 1px 0 rgba(255, 255, 255, 0.05)
          `,
          overflow: "hidden",
        }}
      >
        {/* Cabinet top edge highlight */}
        <div
          style={{
            height: "2px",
            background: `linear-gradient(90deg, transparent 0%, ${accentColor}40 50%, transparent 100%)`,
          }}
        />

        {/* Content area */}
        <div style={{ padding: "16px" }}>{children}</div>

        {/* Cabinet bottom edge */}
        <div
          style={{
            height: "2px",
            background: `linear-gradient(90deg, transparent 0%, ${colors.border.emphasis}40 50%, transparent 100%)`,
          }}
        />
      </div>

      {/* Floor reflection */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "20vh",
          background: `linear-gradient(180deg, transparent 0%, ${accentColor}08 100%)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
