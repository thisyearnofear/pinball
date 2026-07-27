/**
 * Burst FX — lightweight particle burst for micro-interactions.
 *
 * Spawns a short-lived cluster of colored particles at a screen coordinate,
 * animated via the Web Animations API (no React state, no re-renders).
 * Used for lobby interactions: mode card select, difficulty toggle,
 * tournament entry confirmation.
 *
 * Core Principles:
 * - PERFORMANT: WAAPI runs off the main render thread; particles self-clean.
 * - CLEAN: pure function, no module state, no side effects beyond DOM nodes.
 */

type BurstOptions = {
  /** Particle count (default 12) */
  count?: number;
  /** Colors to randomly pick from */
  colors?: string[];
  /** Min/max travel distance in px (default 40–90) */
  distance?: [number, number];
  /** Duration in ms (default 600) */
  duration?: number;
  /** Particle size in px (default 5) */
  size?: number;
};

const DEFAULT_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#f59e0b", "#22c55e"];

export function burstAt(
  x: number,
  y: number,
  options: BurstOptions = {},
): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const {
    count = 12,
    colors = DEFAULT_COLORS,
    distance = [40, 90],
    duration = 600,
    size = 5,
  } = options;

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:500;";
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const dist = distance[0] + Math.random() * (distance[1] - distance[0]);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const sz = size + Math.random() * 3;

    particle.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${color};border-radius:50%;box-shadow:0 0 ${sz}px ${color};will-change:transform,opacity;`;

    container.appendChild(particle);

    const anim = particle.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 },
      ],
      { duration: duration + Math.random() * 200, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "forwards" },
    );

    anim.onfinish = () => {
      particle.remove();
      if (container.childElementCount === 0) container.remove();
    };
  }
}

/**
 * Trigger a burst centered on an element's bounding box.
 */
export function burstOnElement(el: HTMLElement, options?: BurstOptions): void {
  const rect = el.getBoundingClientRect();
  burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
}
