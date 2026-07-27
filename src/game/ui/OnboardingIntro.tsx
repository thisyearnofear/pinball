import React, { useState } from "react";
import { Button } from "./Button";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  onComplete: () => void;
  onSkip: () => void;
};

const slides = [
  {
    icon: "🎯",
    title: "Kamikaze Ball",
    body: "The world's first verifiable arcade. In Kamikaze mode the machine fights to keep the ball alive — you win by draining it fast. Tap to nudge, collect power-ups, and outsmart the table.",
  },
  {
    icon: "🕹️",
    title: "Two Ways to Play",
    body: "Kamikaze is the flagship: AI flippers, munition crates, fastest drain wins. Prefer tradition? Classic mode is pure high-score pinball. Every tournament is tied to one mode.",
  },
  {
    icon: "⛓️",
    title: "Onchain Tournaments",
    body: "Enter tournaments with crypto entry fees. Every score is cryptographically signed and settled onchain. Verifiable, permanent, and auditable — no black-box leaderboards.",
  },
  {
    icon: "💰",
    title: "Win Real Prizes",
    body: "Top players split the prize pot. Entry fees fund the rewards, and payouts are automatic via smart contracts. Lower time = higher rank in Kamikaze mode.",
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
            {slide === slides.length - 1 ? "Let's Go" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
