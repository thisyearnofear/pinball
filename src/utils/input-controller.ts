type Callbacks = {
  onLeftFlip: (isDown: boolean) => void;
  onRightFlip: (isDown: boolean) => void;
  onBump: () => void;
  onPan?: (delta: number) => void;
  onTogglePause?: () => void;
  onNudge?: (x: number, y: number) => void;
  isKamikaze?: () => boolean;
};

type TouchStartState = {
  y: number;
  time: number;
};

const SWIPE_THRESHOLD = 100;
const SWIPE_TIME = 400;

export function createInputController(cb: Callbacks, nudgeTarget?: HTMLElement) {
  const touchStart: TouchStartState = { y: 0, time: 0 };

  // Kamikaze Ball: tap the play area to nudge ball toward tap location
  function handleClick(e: MouseEvent) {
    if (!cb.isKamikaze?.()) return;
    cb.onNudge?.(e.clientX, e.clientY);
  }

  function handleKey(event: KeyboardEvent) {
    const { type, keyCode } = event;
    switch (keyCode) {
      default:
        if (process.env.NODE_ENV !== "production") {
          if (type === "keyup") {
            return;
          }
          switch (keyCode) {
            case 80:
              cb.onTogglePause?.();
              break;
            case 38:
              cb.onPan?.(-25);
              break;
            case 40:
              cb.onPan?.(25);
              break;
          }
        }
        return;
      case 32:
        if (type === "keydown") {
          cb.onBump();
        }
        event.preventDefault();
        break;
      case 37:
        cb.onLeftFlip(type === "keydown");
        event.preventDefault();
        break;
      case 39:
        cb.onRightFlip(type === "keydown");
        event.preventDefault();
        break;
    }
  }

  function handleTouchStart(isLeft: boolean, event: TouchEvent) {
    isLeft ? cb.onLeftFlip(true) : cb.onRightFlip(true);
    for (let i = 0; i < event.touches.length; i++) {
      const t = event.touches.item(i);
      if (!t) continue;
      touchStart.y = t.pageY;
      touchStart.time = window.performance.now();
    }
  }

  function handleTouchEnd(isLeft: boolean, event: TouchEvent) {
    isLeft ? cb.onLeftFlip(false) : cb.onRightFlip(false);
    if (event.type === "touchend" && window.performance.now() - touchStart.time < SWIPE_TIME) {
      const movedBy = event.changedTouches[0]?.pageY - touchStart.y;
      if (movedBy < -SWIPE_THRESHOLD) {
        cb.onBump();
      }
    }
  }

  function addListeners() {
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    // Kamikaze Ball: tap-to-nudge on click, scoped to the play area
    (nudgeTarget ?? window).addEventListener("click", handleClick as EventListener);
  }

  function removeListeners() {
    window.removeEventListener("keydown", handleKey);
    window.removeEventListener("keyup", handleKey);
    (nudgeTarget ?? window).removeEventListener("click", handleClick as EventListener);
  }

  return {
    addListeners,
    removeListeners,
    handleTouchStart,
    handleTouchEnd,
  };
}

/**
 * Kamikaze Ball gesture controller (Phase 2 player agency).
 *
 * Maps pointer gestures on the play surface to three deliberate verbs so the
 * mode stops being "tap and hope":
 *   - HOLD then release: charged nudge toward the release point (up to 3x).
 *   - SWIPE DOWN: deliberate dive (bypass the machine's emergency save).
 *   - DOUBLE-TAP: deploy the banked munition.
 * A quick tap still performs a normal nudge.
 *
 * `shouldHandle` gates input (e.g. false when paused / not in kamikaze mode).
 */
export type KamikazeGestures = {
  onNudge: (x: number, y: number, power: number) => void;
  onDive: () => void;
  onDeploy: () => void;
  onTiltLock: () => void;
  /**
   * Gates double-tap deploy: when provided and it returns false, a double-tap
   * is treated as two ordinary nudges instead of a no-op deploy. Removes the
   * tap vs double-tap ambiguity when nothing is banked.
   */
  hasMunition?: () => boolean;
  onChargeTick?: (power: number) => void;
  onChargeEnd?: () => void;
  /** Reports the pointer's screen position while charging (null when released). */
  onAim?: (pointerX: number | null, pointerY: number | null) => void;
  shouldHandle: () => boolean;
};

const HOLD_TO_CHARGE_MS = 160;
const CHARGE_FULL_MS = 900; // time from hold-start to max power
const MAX_POWER = 3;
const SWIPE_DOWN_PX = 60;
const SWIPE_UP_PX = 60;
const DOUBLE_TAP_MS = 280;

export function attachKamikazeGestures(target: HTMLElement, g: KamikazeGestures): () => void {
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let charging = false;
  let chargeRaf = 0;
  let lastTapAt = 0;
  let swiped = false;
  let curX = 0;
  let curY = 0;

  function powerFor(elapsed: number): number {
    if (elapsed < HOLD_TO_CHARGE_MS) return 1;
    const charged = (elapsed - HOLD_TO_CHARGE_MS) / CHARGE_FULL_MS;
    return 1 + Math.min(1, charged) * (MAX_POWER - 1);
  }

  function startCharge() {
    charging = true;
    const loop = () => {
      if (!charging) return;
      g.onChargeTick?.(powerFor(window.performance.now() - downAt));
      g.onAim?.(curX, curY);
      chargeRaf = requestAnimationFrame(loop);
    };
    chargeRaf = requestAnimationFrame(loop);
  }

  function stopCharge() {
    charging = false;
    cancelAnimationFrame(chargeRaf);
    g.onChargeEnd?.();
    g.onAim?.(null, null);
  }

  function onDown(e: PointerEvent) {
    if (!g.shouldHandle()) return;
    downX = e.clientX;
    downY = e.clientY;
    curX = e.clientX;
    curY = e.clientY;
    downAt = window.performance.now();
    swiped = false;
    startCharge();
  }

  function onMove(e: PointerEvent) {
    curX = e.clientX;
    curY = e.clientY;
    if (!charging || swiped) return;
    if (e.clientY - downY > SWIPE_DOWN_PX) {
      swiped = true;
      stopCharge();
      g.onDive();
    } else if (downY - e.clientY > SWIPE_UP_PX) {
      swiped = true;
      stopCharge();
      g.onTiltLock();
    }
  }

  function onUp(e: PointerEvent) {
    if (!g.shouldHandle()) return;
    const wasCharging = charging;
    stopCharge();
    if (swiped) { swiped = false; return; }

    const now = window.performance.now();
    const held = now - downAt;

    // Double-tap detection (only for quick taps, not charged releases).
    // When no munition is banked the second tap falls through to a normal
    // nudge, so a fast double nudge never silently eats the input.
    if (held < HOLD_TO_CHARGE_MS && now - lastTapAt < DOUBLE_TAP_MS && g.hasMunition?.()) {
      lastTapAt = 0;
      g.onDeploy();
      return;
    }
    lastTapAt = held < HOLD_TO_CHARGE_MS ? now : 0;

    // Charged release: nudge toward the release point with scaled power.
    const power = wasCharging ? powerFor(held) : 1;
    g.onNudge(e.clientX, e.clientY, power);
  }

  function onCancel() {
    if (charging) stopCharge();
    swiped = false;
  }

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onCancel);
  target.addEventListener("pointerleave", onCancel);

  return () => {
    stopCharge();
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onCancel);
    target.removeEventListener("pointerleave", onCancel);
  };
}
