import React, { useEffect, useRef } from "react";

/**
 * Ambient background FX for the lobby: an animated scanline grid that
 * drifts slowly, plus floating "ember" particles that rise and fade.
 *
 * Pure CSS animation where possible (grid drift, scan sweep) and a single
 * rAF loop for particles. Respects prefers-reduced-motion (renders nothing).
 * Themed via the active world's --world-primary CSS variable.
 *
 * Core Principles:
 * - PERFORMANT: particles use a shared rAF; count is capped; CSS transforms only.
 * - CLEAN: self-contained, no external state, pointer-events: none.
 */
export function AmbientBackground({ particleCount = 18 }: { particleCount?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;

    type Ember = {
      x: number;
      y: number;
      vy: number;
      vx: number;
      size: number;
      hue: number;
      alpha: number;
      alphaDir: number;
      life: number;
      maxLife: number;
    };

    let embers: Ember[] = [];

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Seed embers proportional to viewport area, capped.
      const target = Math.min(particleCount, Math.floor((window.innerWidth * window.innerHeight) / 60000));
      embers = Array.from({ length: target }, () => spawnEmber(true));
    }

    function spawnEmber(initial = false): Ember {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const hue = 220 + Math.random() * 60; // indigo → violet range
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 10,
        vy: -(0.15 + Math.random() * 0.35),
        vx: (Math.random() - 0.5) * 0.15,
        size: 1 + Math.random() * 2.5,
        hue,
        alpha: 0,
        alphaDir: 1,
        life: 0,
        maxLife: 600 + Math.random() * 800,
      };
    }

    function tick() {
      if (!running || !canvas || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life++;
        e.x += e.vx;
        e.y += e.vy;

        // Fade in then out across the lifetime.
        const lifeFrac = e.life / e.maxLife;
        if (lifeFrac < 0.15) {
          e.alpha = lifeFrac / 0.15;
        } else if (lifeFrac > 0.7) {
          e.alpha = Math.max(0, (1 - lifeFrac) / 0.3);
        } else {
          e.alpha = 1;
        }
        e.alpha *= 0.5; // keep them subtle

        if (e.life >= e.maxLife || e.y < -10) {
          embers[i] = spawnEmber();
          continue;
        }

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${e.hue}, 80%, 65%, ${e.alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${e.hue}, 80%, 60%, ${e.alpha})`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

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
  }, [particleCount]);

  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Animated grid — drifts slowly to give a sense of motion */}
      <div
        style={{
          position: "absolute",
          inset: "-50%",
          backgroundImage: `
            linear-gradient(to right, rgba(99, 102, 241, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          animation: "ambientGridDrift 24s linear infinite",
        }}
      />
      {/* Radial vignette so the grid fades toward the edges */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,15,0.6) 75%, rgba(10,10,15,0.9) 100%)",
        }}
      />
      {/* Slow scan sweep */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: "40%",
          background: "linear-gradient(180deg, transparent, rgba(99,102,241,0.025), transparent)",
          animation: "ambientScanSweep 8s ease-in-out infinite",
        }}
      />
      {/* Floating embers */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      <style>{`
        @keyframes ambientGridDrift {
          from { transform: translate(0, 0); }
          to { transform: translate(48px, 48px); }
        }
        @keyframes ambientScanSweep {
          0% { transform: translateY(-50%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(250%); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
