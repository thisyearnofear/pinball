type Callbacks = {
  onLeftFlip: (isDown: boolean) => void;
  onRightFlip: (isDown: boolean) => void;
  onBump: () => void;
  onPan?: (delta: number) => void;
  onTogglePause?: () => void;
  onNudge?: (x: number, y: number) => void;
  isKamikaze?: () => boolean;
  /** When false, background key/click handling is suspended (e.g. while an
   *  in-world encounter or menu owns input). Flipper keyups still release. */
  shouldHandle?: () => boolean;
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
    if (cb.shouldHandle && !cb.shouldHandle()) return;
    cb.onNudge?.(e.clientX, e.clientY);
  }

  function handleKey(event: KeyboardEvent) {
    const { type, keyCode } = event;
    if (cb.shouldHandle && !cb.shouldHandle()) {
      // Let flipper keyups through so a held flipper always releases; swallow
      // everything else while a dialog/encounter owns the keyboard.
      if (type === "keyup" && keyCode === 37) cb.onLeftFlip(false);
      if (type === "keyup" && keyCode === 39) cb.onRightFlip(false);
      return;
    }
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
    const t = event.touches.item(0);
    if (!t) return;
    touchStart.y = t.pageY;
    touchStart.time = window.performance.now();
  }

  function handleTouchEnd(isLeft: boolean, event: TouchEvent) {
    isLeft ? cb.onLeftFlip(false) : cb.onRightFlip(false);
    const endY = event.changedTouches.item(0)?.pageY;
    if (event.type !== "touchend" || endY === null || endY === undefined) return;
    if (window.performance.now() - touchStart.time >= SWIPE_TIME) return;
    // Swipe up = bump the table.
    if (endY - touchStart.y < -SWIPE_THRESHOLD) cb.onBump();
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
 *   - SWIPE UP: tilt-lock.
 *   - DOUBLE-TAP: deploy the banked munition.
 * A quick tap still performs a normal nudge.
 *
 * Holding Space charges the same nudge for keyboard players, who otherwise had
 * no nudge verb at all in this mode — only flippers, dive, deploy and tilt-lock.
 * The released power is identical; only the aim differs, because a keyboard has
 * no pointer to aim with, so the mount resolves a fallback direction.
 *
 * `shouldHandle` gates input (e.g. false when paused / not in kamikaze mode).
 */
export type KamikazeGestures = {
  /** `x`/`y` are null for a keyboard release, where there is no pointer to aim by. */
  onNudge: (x: number | null, y: number | null, power: number) => void;
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
  /** Fires once per notch crossed (1, 2, 3) so charge can be felt, not just read. */
  onChargeNotch?: (notch: number, power: number) => void;
  onChargeEnd?: () => void;
  /** Reports the pointer's screen position while charging (null when released). */
  onAim?: (pointerX: number | null, pointerY: number | null) => void;
  /** Space-hold charging. Omit or return false to disable it (e.g. shot-calling). */
  canKeyboardCharge?: () => boolean;
  shouldHandle: () => boolean;
};

const HOLD_TO_CHARGE_MS = 160;
const CHARGE_FULL_MS = 900; // time from hold-start to max power
/** The charge ceiling. Kept in step with MAX_CHARGE_POWER in utils/haptics,
 *  which scales its release feedback against it (pinned by haptics.spec.ts). */
export const MAX_POWER = 3;
const SWIPE_DOWN_PX = 60;
const SWIPE_UP_PX = 60;
const DOUBLE_TAP_MS = 280;

/** Which charge notch a power value sits in: 0 below 2x, then 1, 2, 3. */
export function chargeNotchFor(power: number): number {
  if (power >= 3) return 3;
  if (power >= 2) return 2;
  if (power > 1) return 1;
  return 0;
}

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
  /** The pointer that owns the current charge; other fingers are ignored. */
  let activePointerId: number | null = null;
  let captured = false;
  let keyboardCharging = false;
  let notch = 0;

  function powerFor(elapsed: number): number {
    if (elapsed < HOLD_TO_CHARGE_MS) return 1;
    const charged = (elapsed - HOLD_TO_CHARGE_MS) / CHARGE_FULL_MS;
    return 1 + Math.min(1, charged) * (MAX_POWER - 1);
  }

  /** Emits the charge tick, and a one-shot notch crossing so the mount can
   *  tick the audio and the haptics at the same boundaries. */
  function reportCharge(power: number, aimX: number | null, aimY: number | null) {
    g.onChargeTick?.(power);
    const next = chargeNotchFor(power);
    if (next > notch) {
      notch = next;
      g.onChargeNotch?.(next, power);
    }
    g.onAim?.(aimX, aimY);
  }

  function startCharge() {
    if (charging) return;
    charging = true;
    notch = 0;
    const loop = () => {
      if (!charging) return;
      reportCharge(powerFor(window.performance.now() - downAt), curX, curY);
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

  function releaseCapture() {
    if (!captured || activePointerId === null) return;
    captured = false;
    try {
      target.releasePointerCapture?.(activePointerId);
    } catch {
      /* the pointer is already gone */
    }
  }

  function onDown(e: PointerEvent) {
    if (!g.shouldHandle()) return;
    // A second finger must not reset the charge already in flight: on a
    // two-handed grip the other thumb used to silently restart the timer.
    if (charging && activePointerId !== null && e.pointerId !== activePointerId) return;
    activePointerId = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    curX = e.clientX;
    curY = e.clientY;
    downAt = window.performance.now();
    swiped = false;
    // Capture so a finger that drifts off the edge keeps its charge. Without
    // this, pointerleave cancelled the charge the moment the thumb slid.
    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(e.pointerId);
        captured = true;
      } catch {
        captured = false;
      }
    }
    startCharge();
  }

  function onMove(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
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
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    activePointerId = null;
    releaseCapture();
    if (!g.shouldHandle()) return;
    const wasCharging = charging;
    stopCharge();
    if (swiped) {
      swiped = false;
      return;
    }

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

  function onCancel(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    activePointerId = null;
    releaseCapture();
    if (charging) stopCharge();
    swiped = false;
  }

  /**
   * Only reached when the pointer is NOT captured (some browsers, and any
   * environment without pointer capture). With capture the element keeps
   * receiving move/up even outside its bounds, which is the point.
   */
  function onLeave(e: PointerEvent) {
    if (captured) return;
    onCancel(e);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code !== "Space" || e.repeat) return;
    if (!g.shouldHandle()) return;
    if (g.canKeyboardCharge && !g.canKeyboardCharge()) return;
    if (keyboardCharging || charging) return;
    keyboardCharging = true;
    downAt = window.performance.now();
    notch = 0;
    const loop = () => {
      if (!keyboardCharging) return;
      reportCharge(powerFor(window.performance.now() - downAt), null, null);
      chargeRaf = requestAnimationFrame(loop);
    };
    // No `charging` flag here: keyboard and pointer charges are exclusive, and
    // sharing the flag let a Space release cancel a touch charge mid-swipe.
    chargeRaf = requestAnimationFrame(loop);
    e.preventDefault();
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code !== "Space" || !keyboardCharging) return;
    keyboardCharging = false;
    cancelAnimationFrame(chargeRaf);
    const held = window.performance.now() - downAt;
    g.onChargeEnd?.();
    notch = 0;
    g.onNudge(null, null, powerFor(held));
    e.preventDefault();
  }

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onCancel);
  target.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    stopCharge();
    keyboardCharging = false;
    cancelAnimationFrame(chargeRaf);
    activePointerId = null;
    captured = false;
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onCancel);
    target.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
