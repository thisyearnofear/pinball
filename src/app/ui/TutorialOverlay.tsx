import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";

import { STORED_HAS_VIEWED_TUTORIAL } from "@/definitions/settings";
import { getFromStorage, setInStorage } from "@/utils/local-storage";

type Props = {
  onClose: () => void;
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
    const base = touchscreen
      ? ["Tap left side for left flipper.", "Tap right side for right flipper.", "Swipe up to bump the table."]
      : ["Press ← for left flipper.", "Press → for right flipper.", "Press spacebar to bump the table."];

    return [...base, "Bumping is powerful — don’t spam it.", "Keep the ball alive.", "Have fun!"];
  }, [touchscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") setSlide((s) => Math.min(s + 1, slides.length - 1));
    };
    document.addEventListener("keyup", onKey);
    return () => document.removeEventListener("keyup", onKey);
  }, [props, slides.length]);

  return (
    <Modal
      title="Tutorial"
      onClose={() => {
        markTutorialSeen();
        props.onClose();
      }}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              markTutorialSeen();
              props.onClose();
            }}
          >
            Skip
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setSlide((s) => Math.max(0, s - 1))} disabled={slide === 0}>
              Prev
            </button>
            <button
              onClick={() => {
                if (slide === slides.length - 1) {
                  markTutorialSeen();
                  props.onClose();
                } else {
                  setSlide((s) => s + 1);
                }
              }}
            >
              {slide === slides.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ opacity: 0.85, marginBottom: 8 }}>
          Slide {slide + 1} / {slides.length}
        </div>
        <div style={{ fontSize: 16 }}>{slides[slide]}</div>
      </div>
    </Modal>
  );
}

