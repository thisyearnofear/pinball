import React, { useEffect, useState, useRef } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: "circle" | "square" | "star";
};

const COLORS = [
  "#6366f1", "#8b5cf6", "#f59e0b", "#22c55e", "#3b82f6",
  "#ec4899", "#fbbf24", "#a78bfa", "#34d399", "#f472b6",
];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function createParticle(cx: number, cy: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = randomBetween(2, 8);
  const shapes: Particle["shape"][] = ["circle", "square", "star"];

  return {
    id: Math.random() * 100000,
    x: cx,
    y: cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: randomBetween(4, 10),
    rotation: randomBetween(0, 360),
    rotationSpeed: randomBetween(-10, 10),
    opacity: 1,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
  };
}

export function CelebrationParticles({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      particlesRef.current = [];
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 3;

    particlesRef.current = Array.from({ length: 60 }, () => createParticle(cx, cy));
    setParticles([...particlesRef.current]);

    let startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      if (elapsed > 3000) {
        setParticles([]);
        return;
      }

      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15,
          vx: p.vx * 0.99,
          rotation: p.rotation + p.rotationSpeed,
          opacity: Math.max(0, 1 - elapsed / 3000),
        }))
        .filter((p) => p.opacity > 0.01);

      setParticles([...particlesRef.current]);
      frameRef.current = requestAnimationFrame(animate);
    }

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [active]);

  if (!active || particles.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 250,
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "square" ? "2px" : "0",
            transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}
