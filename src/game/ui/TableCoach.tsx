import React, { useEffect, useRef } from "react";

import type { CoachAnchor, CoachCue, CoachCueId } from "@/config/table-coach";

import { colors, radius, spacing, typography } from "@/theme/tokens";

/**
 * Where each cue sits on the playfield. The anchor is part of the teaching: the
 * rule lands dead centre where the eye already is, and a callout drops to the
 * bottom, clear of the HUD and the power-up bar.
 */
const ANCHORS: Record<CoachAnchor, React.CSSProperties> = {
  center: { top: "46%", transform: "translate(-50%, -50%)" },
  bottom: { bottom: "11%", transform: "translateX(-50%)" },
};

type Props = {
  cue: CoachCue;
  onDismiss: (id: CoachCueId) => void;
  /** Optional ink-splash rendered behind the kanji (Rive artboard). */
  splash?: React.ReactNode;
};

/**
 * Asking for help must never count as playing. The chip sits on the playfield,
 * where a click is a nudge, so it swallows the event before replaying the coach.
 */
export function consumeCoachReplayClick(event: { stopPropagation: () => void }, replay: () => void): void {
  event.stopPropagation();
  replay();
}

/**
 * The first-run coach: teaching that happens **on the table**, while the ball
 * is live, instead of in a screen the player pages through first.
 *
 * It is deliberately transparent to input — the wrapper is `pointer-events:
 * none`, so a card can never swallow the nudge it is asking for. Only the
 * dismiss control is clickable, and it stops propagation so dismissing a tip is
 * never mistaken for a tap on the table. How long a cue stays is measured in
 * seconds, because that is the unit the game runs in.
 */
export function TableCoach(props: Props) {
  const { cue, onDismiss } = props;
  const kanji = (
    <span
      aria-hidden="true"
      style={{
        fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
        fontSize: typography.size.xl,
        lineHeight: 1.1,
        color: colors.accent.primaryHover,
        letterSpacing: "0.12em",
      }}
    >
      {cue.kanji}
    </span>
  );

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(cue.id), cue.autoDismissSec * 1000);
    return () => window.clearTimeout(timer);
  }, [cue.id, cue.autoDismissSec, onDismiss]);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        width: "min(330px, 84%)",
        zIndex: 12,
        pointerEvents: "none",
        ...ANCHORS[cue.anchor],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: spacing.sm,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: radius.lg,
          background: "rgba(8, 8, 14, 0.82)",
          border: `1px solid rgba(99, 102, 241, 0.5)`,
          boxShadow: "0 6px 24px rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(6px)",
          animation: "fadeIn 200ms ease",
        }}
      >
        {props.splash ? (
          <span aria-hidden="true" style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 34 }}>
            <span style={{ position: "absolute", inset: -14, pointerEvents: "none" }}>{props.splash}</span>
            {kanji}
          </span>
        ) : kanji}

        <div role="status" aria-live="polite" style={{ flex: 1, textAlign: "left" }}>
          <div
            style={{
              fontFamily: typography.fontFamilyMono,
              fontSize: typography.size.xs,
              letterSpacing: "0.14em",
              color: colors.text.muted,
              marginBottom: 2,
            }}
          >
            HOW TO WIN
          </div>
          {cue.lines.map((line) => (
            <p
              key={line}
              style={{
                margin: 0,
                fontSize: typography.size.sm,
                lineHeight: typography.lineHeight.normal,
                color: colors.text.primary,
              }}
            >
              {line}
            </p>
          ))}
        </div>

        <button
          type="button"
          aria-label="Dismiss tip"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(cue.id);
          }}
          style={{
            pointerEvents: "auto",
            flex: "0 0 auto",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: colors.text.muted,
            fontSize: typography.size.sm,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** How long the chip must be held before it means "show me everything". */
export const COACH_HOLD_MS = 550;

export type CoachChipState = {
  /** A hold is currently being timed. */
  pressed: boolean;
  /** This press outlasted the hold, so its tap has already been spent. */
  held: boolean;
};

export type CoachChipEvent = "press" | "held" | "release" | "tapped";

/** What the chip should *do* — the component owns the timer, this owns the rule. */
export type CoachChipEffect = "arm" | "disarm" | "replay" | "guide" | "none";

export const IDLE_COACH_CHIP: CoachChipState = { pressed: false, held: false };

/**
 * Tap vs hold, as a pure transition so the rule is testable without a browser.
 *
 * A press arms the hold; if the timer wins, the gesture means "the full guide"
 * and the click that follows is swallowed (a hold is one gesture, not two).
 * Releasing first makes it an ordinary tap: replay the table tips. A hold that
 * never had a press behind it — a stray timer — does nothing.
 */
export function coachChipTransition(
  state: CoachChipState,
  event: CoachChipEvent,
): { state: CoachChipState; effect: CoachChipEffect } {
  switch (event) {
    case "press":
      return { state: { pressed: true, held: false }, effect: "arm" };
    case "held":
      if (!state.pressed) return { state, effect: "none" };
      return { state: { pressed: true, held: true }, effect: "guide" };
    case "release":
      if (!state.pressed) return { state, effect: "none" };
      return { state: { ...state, pressed: false }, effect: "disarm" };
    case "tapped":
      return { state: { pressed: false, held: false }, effect: state.held ? "none" : "replay" };
  }
}

/**
 * The standing "give me that again" affordance. The first run teaches once; a
 * player who missed it can tap to replay the script from the top without
 * leaving the table, or hold for the full reference — that is the difference
 * between "say that again" and "show me everything".
 */
export function CoachReplayChip(props: { onReplay: () => void; onOpenGuide?: () => void }) {
  const { onReplay, onOpenGuide } = props;
  const stateRef = useRef<CoachChipState>(IDLE_COACH_CHIP);
  const holdTimerRef = useRef(0);

  // The timer is the only side effect; the decision itself lives in the pure
  // transition above.
  const dispatch = (event: CoachChipEvent) => {
    const { state, effect } = coachChipTransition(stateRef.current, event);
    stateRef.current = state;
    if (effect === "arm") {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => dispatch("held"), COACH_HOLD_MS);
    } else if (effect === "disarm") {
      window.clearTimeout(holdTimerRef.current);
    } else if (effect === "guide") {
      onOpenGuide?.();
    } else if (effect === "replay") {
      onReplay();
    }
  };

  useEffect(() => () => window.clearTimeout(holdTimerRef.current), []);

  return (
    <button
      type="button"
      aria-label={
        onOpenGuide
          ? "How to win — tap to replay the table tips, hold for the full guide"
          : "How to win — tap to replay the table tips"
      }
      title={`Tap: replay the tips${onOpenGuide ? " · Hold: full guide" : ""}`}
      onClick={(e) => consumeCoachReplayClick(e, () => dispatch("tapped"))}
      // Only wire the hold when there is somewhere for it to go, so the hold can
      // never swallow a tap it cannot honour.
      onPointerDown={onOpenGuide ? () => dispatch("press") : undefined}
      onPointerUp={onOpenGuide ? () => dispatch("release") : undefined}
      onPointerLeave={onOpenGuide ? () => dispatch("release") : undefined}
      onPointerCancel={onOpenGuide ? () => dispatch("release") : undefined}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        zIndex: 12,
        pointerEvents: "auto",
        padding: "5px 11px",
        borderRadius: radius.full,
        background: "rgba(8, 8, 14, 0.72)",
        border: `1px solid ${colors.border.emphasis}`,
        color: colors.text.secondary,
        fontFamily: typography.fontFamilyMono,
        fontSize: typography.size.xs,
        letterSpacing: "0.06em",
        cursor: "pointer",
      }}
    >
      ? How to win
    </button>
  );
}
