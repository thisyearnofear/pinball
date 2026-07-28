import React, { useState } from "react";
import { Button } from "./Button";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  onComplete: () => void;
  onSkip: () => void;
};

const slides = [
  {
    icon: "🌸",
    title: "Kamikaze Ball",
    body: "神風 — the divine wind. In most pinball you lose the ball. Here the blossom's fall IS the win: the machine fights to keep it aloft, and you win by draining it fast. No wallet needed — just play.",
  },
  {
    icon: "🎮",
    title: "Your Hands on the Table",
    body: "TAP to nudge the ball. HOLD to charge a power nudge (up to 3×). SWIPE DOWN to dive — a deliberate drain the machine can't save. DOUBLE-TAP to fire a banked munition. Every verb matters.",
  },
  {
    icon: "🏯",
    title: "A New Challenge Daily",
    body: "Each day the wind shifts: a fresh seeded challenge with its own table, mode, and machine. Chase your personal best, build drain streaks, and climb the daily board. Something to come back to.",
  },
  {
    icon: "⛓️",
    title: "Play for Real (Optional)",
    body: "When you're ready, connect a wallet to enter onchain tournaments — entry fees fund the pot, scores are signed and settled on Polygon Amoy, payouts are automatic. Totally optional; practice is free.",
  },
];

export function OnboardingIntro(props: Props) {
  const [slide, setSlide] = useState(0);
  const current = slides[slide];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: colors.background.overlay,
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        zIndex: 400,
        animation: "fadeIn 200ms ease",
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: colors.background.surface,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.xl,
          padding: spacing["2xl"],
          textAlign: "center",
          animation: "slideUp 250ms ease",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: spacing.lg }}>{current.icon}</div>

        <h2 style={{
          margin: `0 0 ${spacing.md}px`,
          fontSize: typography.size["2xl"],
          fontWeight: typography.weight.bold,
          background: colors.accent.gradient,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          {current.title}
        </h2>

        <p style={{
          margin: `0 0 ${spacing.xl}px`,
          fontSize: typography.size.md,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
        }}>
          {current.body}
        </p>

        <div style={{ display: "flex", gap: spacing.xs, justifyContent: "center", marginBottom: spacing.xl }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === slide ? 24 : 8,
                height: 8,
                borderRadius: radius.full,
                background: i === slide ? colors.accent.primary : colors.border.default,
                transition: "all 0.2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: spacing.sm }}>
          <Button variant="ghost" onClick={props.onSkip} style={{ flex: 1 }}>
            Skip
          </Button>
          <Button
            onClick={() => {
              if (slide === slides.length - 1) props.onComplete();
              else setSlide((s) => s + 1);
            }}
            style={{ flex: 2 }}
          >
            {slide === slides.length - 1 ? "Start Playing" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
