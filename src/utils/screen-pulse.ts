/**
 * The visual echo of the haptic vocabulary.
 *
 * Haptics are the narrowest of the feedback channels: iOS Safari has no
 * Vibration API at all, and a desktop browser exposes one that drives no
 * hardware. Without an echo, the events that carry the most meaning — a charged
 * nudge landing, MAMORU reading your lane and taking the ball, the drain —
 * are silent *and* invisible to two of the three places this game is played.
 * Audio already carries all of them; this carries the impact.
 *
 * Being the same vocabulary, it inherits the same discipline: the engine only
 * echoes events it decided to fire, which is what keeps a bumper run or a
 * flipper roll from strobing the screen. That is the entire reason this lives
 * behind the haptics engine rather than being its own event listener.
 *
 * One element, opacity only, cancelled and restarted on retrigger: compositor
 * work, no layout, no rAF of its own, and nothing to clean up beyond the host
 * element it sits in.
 */

export type VisualEcho = (weight: number) => void;

/** Clear in the middle, bright at the rim: impact without obscuring the ball. */
const RIM =
  "radial-gradient(ellipse at center, rgba(255,255,255,0) 52%, rgba(255,255,255,0.92) 100%)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Returns a pulse function, or `null` where it cannot be drawn — the caller
 * should then leave the echo unset rather than animate nothing per event.
 */
export function createScreenPulse(host: HTMLElement): VisualEcho | null {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "6",
    opacity: "0",
    background: RIM,
  });
  host.appendChild(el);

  // Web Animations, or nothing. The alternative (restarting a CSS animation by
  // reading offsetWidth back) forces a synchronous reflow on every pulse.
  if (typeof el.animate !== "function") {
    el.remove();
    return null;
  }

  let running: Animation | null = null;

  return (weight: number) => {
    // A rim flash is motion, and this repo already honours the preference
    // everywhere else it draws one. Audio still carries the beat.
    if (prefersReducedMotion()) return;
    const strong = weight >= 2;
    // Cancel rather than let them stack: the same reason the haptics engine
    // drops a flipper under the fanfare instead of queuing it.
    running?.cancel();
    running = el.animate(
      [{ opacity: 0 }, { opacity: strong ? 0.5 : 0.2, offset: 0.14 }, { opacity: 0 }],
      { duration: strong ? 260 : 130, easing: "ease-out" }
    );
  };
}
