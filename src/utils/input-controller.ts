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

export function createInputController(cb: Callbacks) {
  const touchStart: TouchStartState = { y: 0, time: 0 };

  // Kamikaze Ball: tap anywhere to nudge ball toward tap location
  function handleKamikazeTap(clientX: number, clientY: number) {
    if (!cb.isKamikaze?.()) return;
    cb.onNudge?.(clientX, clientY);
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
    // Kamikaze Ball: tap-to-nudge on click
    window.addEventListener("click", (e) => {
      handleKamikazeTap(e.clientX, e.clientY);
    });
  }

  function removeListeners() {
    window.removeEventListener("keydown", handleKey);
    window.removeEventListener("keyup", handleKey);
  }

  return {
    addListeners,
    removeListeners,
    handleTouchStart,
    handleTouchEnd,
  };
}
