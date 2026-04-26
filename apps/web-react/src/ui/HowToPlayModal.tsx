import React from "react";
import { Modal } from "./Modal";

export function HowToPlayModal(props: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={props.onClose}>
      <p>
        Gameplay: keep the ball in play and rack up points by hitting bumpers, poppers and triggers.
      </p>

      <h3 style={{ marginTop: 16 }}>Keyboard</h3>
      <p>
        Left flipper: ← (left arrow). Right flipper: → (right arrow). Bump: spacebar.
      </p>

      <h3 style={{ marginTop: 16 }}>Touchscreen</h3>
      <p>
        Tap left/right half of the screen for the flippers. Swipe up to bump.
      </p>
    </Modal>
  );
}

