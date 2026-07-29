import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

import { STORED_HAS_VIEWED_TUTORIAL } from "@/definitions/settings";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import type { GameMode } from "@/config/tournaments";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  onClose: () => void;
  gameMode?: GameMode;
};

export function hasSeenTutorial(): boolean {
  return getFromStorage(STORED_HAS_VIEWED_TUTORIAL) === "true";
}

export function markTutorialSeen() {
  setInStorage(STORED_HAS_VIEWED_TUTORIAL, "true");
}

export function TutorialOverlay(props: Props) {
  const [slide, setSlide] = useState(0);
  const touchscreen = useMemo(() => {
    return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
  }, []);

  const slides = useMemo(() => {
    if (props.gameMode === "kamikaze") {
      const controlSlides = touchscreen
        ? [
            "TAP to nudge the ball toward your finger.",
            "HOLD to charge a power nudge — an aim line shows the direction.",
            "SWIPE DOWN to DIVE: force a drain the machine can't save.",
            "SWIPE UP to TILT-LOCK: freeze the machine's flippers briefly.",
            "DOUBLE-TAP to deploy a banked munition.",
          ]
        : [
            "CLICK to nudge the ball toward your cursor.",
            "HOLD to charge a power nudge — an aim line shows the direction.",
            "Press ↓ (or drag down) to DIVE: force a drain the machine can't save.",
            "Press SHIFT (or drag up) to TILT-LOCK: freeze the machine's flippers.",
            "Press D (or double-click) to deploy a banked munition.",
          ];
      return [
        "The machine fights to SAVE the ball.",
        "You want to DRAIN it. Fastest drain wins.",
        ...controlSlides,
        "Bumpers and targets add penalty time. Avoid them.",
        "Beat the machine!",
      ];
    }

    const base = touchscreen
      ? ["Tap left side for left flipper.", "Tap right side for right flipper.", "Swipe up to bump the table."]
      : ["Press ← for left flipper.", "Press → for right flipper.", "Press spacebar to bump the table."];

    return [...base, "Bumping is powerful — don't spam it.", "Keep the ball alive.", "Have fun!"];
  }, [touchscreen, props.gameMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { markTutorialSeen(); props.onClose(); }
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") setSlide((s) => Math.min(s + 1, slides.length - 1));
    };
    document.addEventListener("keyup", onKey);
    return () => document.removeEventListener("keyup", onKey);
  }, [props.onClose, slides.length]);

  const handleClose = () => { markTutorialSeen(); props.onClose(); };
  const handleNext = () => {
    if (slide === slides.length - 1) handleClose();
    else setSlide((s) => s + 1);
  };

  return (
    <Modal title="Tutorial" onClose={handleClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xl, alignItems: "center", textAlign: "center" }}>
        <div style={{
          fontSize: typography.size['3xl'],
          fontWeight: typography.weight.bold,
          color: colors.text.primary,
          minHeight: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {slides[slide]}
        </div>

        <div style={{ display: "flex", gap: spacing.xs }}>
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

        <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>
          {slide + 1} / {slides.length}
        </div>

        <div style={{ display: "flex", gap: spacing.sm, width: "100%" }}>
          <Button variant="ghost" onClick={handleClose}>
            Skip
          </Button>
          <Button
            variant="secondary"
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
            disabled={slide === 0}
            style={{ flex: 1 }}
          >
            Prev
          </Button>
          <Button onClick={handleNext} style={{ flex: 2 }}>
            {slide === slides.length - 1 ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
