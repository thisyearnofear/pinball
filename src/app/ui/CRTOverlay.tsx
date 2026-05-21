import React from "react";

type Props = {
  active?: boolean;
  intensity?: number;
  children?: React.ReactNode;
};

export function CRTOverlay({ active = true, intensity = 0.4, children }: Props) {
  if (!active) return <>{children}</>;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {children}

      {/* Scanlines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, ${intensity * 0.15}) 2px,
            rgba(0, 0, 0, ${intensity * 0.15}) 4px
          )`,
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(
            ellipse at center,
            transparent 60%,
            rgba(0, 0, 0, ${intensity * 0.6}) 100%
          )`,
          pointerEvents: "none",
          zIndex: 11,
        }}
      />

      {/* Phosphor glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: `inset 0 0 ${60 * intensity}px rgba(99, 102, 241, ${intensity * 0.15})`,
          pointerEvents: "none",
          zIndex: 12,
        }}
      />

      {/* Subtle curvature via border radius */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "18px",
          border: `1px solid rgba(255, 255, 255, ${intensity * 0.08})`,
          pointerEvents: "none",
          zIndex: 13,
        }}
      />

      {/* Flicker animation */}
      <style>{`
        @keyframes crtFlicker {
          0%, 100% { opacity: 1; }
          92% { opacity: 1; }
          93% { opacity: 0.8; }
          94% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
