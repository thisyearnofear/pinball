import React, { useEffect, useRef } from "react";

/**
 * SakuraPetals — falling cherry-blossom petals for the Kamikaze Ball lobby.
 *
 * The falling petal is the visual heart of the identity: in Kamikaze mode
 * draining the ball is victory, and the petal's noble fall mirrors it
 * (物の哀れ, mono no aware — beauty in transience).
 *
 * A single rAF canvas loop draws small petal ellipses that drift down with a
 * gentle horizontal sway and slow rotation. Respects prefers-reduced-motion
 * (renders nothing). pointer-events: none, purely decorative.
 */
export function SakuraPetals({ count = 24 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;

    type Petal = {
      x: number; y: number;
      vy: number; sway: number; swayPhase: number;
      size: number; rot: number; rotSpeed: number;
      alpha: number; shade: number;
    };

    let petals: Petal[] = [];

    function spawn(initial = false): Petal {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : -12,
        vy: 0.35 + Math.random() * 0.55,
        sway: 0.3 + Math.random() * 0.5,
        swayPhase: Math.random() * Math.PI * 2,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 0.25 + Math.random() * 0.35,
        shade: Math.random(),
      };
    }

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(count, Math.floor(window.innerWidth / 45));
      petals = Array.from({ length: target }, () => spawn(true));
    }

    function drawPetal(p: Petal) {
      if (!ctx) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Petal: two overlapping arcs form a teardrop-ish blossom petal.
      const r = Math.floor(240 + p.shade * 15);
      const g = Math.floor(168 + p.shade * 30);
      const b = Math.floor(196 + p.shade * 30);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      if (!running || !canvas || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.swayPhase += 0.015;
        p.x += Math.sin(p.swayPhase) * p.sway;
        p.y += p.vy;
        p.rot += p.rotSpeed;

        if (p.y > h + 12 || p.x < -12 || p.x > w + 12) {
          petals[i] = spawn();
          continue;
        }
        drawPetal(p);
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(tick);
      else cancelAnimationFrame(raf);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [count]);

  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} aria-hidden="true" />;
}
