/**
 * World Particles - 3D particle effects for ball impacts and world reactions.
 * 
 * Spawns particle bursts at ball position in world space when the ball
 * hits bumpers, triggers, or other game elements.
 */

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ParticleBurst {
  particles: Particle[];
  createdAt: number;
}

export interface ParticleConfig {
  count: number;
  spread: number;
  speed: number;
  lifetime: number;
  color: string;
  size: number;
}

const DEFAULT_BURST: ParticleConfig = {
  count: 20,
  spread: 2,
  speed: 0.5,
  lifetime: 1000,
  color: '#ffffff',
  size: 3,
};

const BUMPER_COLORS: Record<string, string> = {
  red: '#ff4444',
  blue: '#4444ff',
  green: '#44ff44',
  yellow: '#ffff44',
  purple: '#ff44ff',
  white: '#ffffff',
};

export class WorldParticles {
  private bursts: ParticleBurst[] = [];
  private container: HTMLDivElement | null = null;
  private particleElements: Map<string, HTMLDivElement> = new Map();
  private animationId: number | null = null;
  private enabled = true;

  /**
   * Initialize particle system with a container
   */
  initialize(container: HTMLDivElement): void {
    this.container = container;
    this.startRenderLoop();
  }

  /**
   * Enable/disable particle system
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAll();
    }
  }

  /**
   * Spawn a particle burst at world position
   */
  spawnBurst(
    worldX: number,
    worldY: number,
    worldZ: number,
    config?: Partial<ParticleConfig>
  ): void {
    if (!this.enabled) return;

    const cfg = { ...DEFAULT_BURST, ...config };
    const particles: Particle[] = [];

    for (let i = 0; i < cfg.count; i++) {
      const angle = (Math.PI * 2 * i) / cfg.count + Math.random() * 0.5;
      const elevation = (Math.random() - 0.5) * cfg.spread;

      particles.push({
        x: worldX,
        y: worldY,
        z: worldZ,
        vx: Math.cos(angle) * cfg.speed * (0.5 + Math.random() * 0.5),
        vy: elevation * cfg.speed,
        vz: Math.sin(angle) * cfg.speed * (0.5 + Math.random() * 0.5),
        life: cfg.lifetime,
        maxLife: cfg.lifetime,
        color: cfg.color,
        size: cfg.size * (0.5 + Math.random() * 0.5),
      });
    }

    this.bursts.push({
      particles,
      createdAt: performance.now(),
    });
  }

  /**
   * Spawn bumper impact particles
   */
  spawnBumperImpact(
    worldX: number,
    worldY: number,
    worldZ: number,
    bumperColor: string = 'white'
  ): void {
    this.spawnBurst(worldX, worldY, worldZ, {
      count: 15,
      spread: 1.5,
      speed: 0.4,
      lifetime: 800,
      color: BUMPER_COLORS[bumperColor] || '#ffffff',
      size: 4,
    });
  }

  /**
   * Spawn milestone celebration particles
   */
  spawnMilestoneCelebration(
    worldX: number,
    worldY: number,
    worldZ: number
  ): void {
    this.spawnBurst(worldX, worldY, worldZ, {
      count: 40,
      spread: 3,
      speed: 0.8,
      lifetime: 2000,
      color: '#ffd700',
      size: 5,
    });
  }

  /**
   * Clear all particles
   */
  clearAll(): void {
    this.bursts = [];
    for (const [, el] of this.particleElements) {
      el.remove();
    }
    this.particleElements.clear();
  }

  /**
   * Dispose particle system
   */
  dispose(): void {
    this.stopRenderLoop();
    this.clearAll();
    this.container = null;
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.update();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private stopRenderLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private update(): void {
    if (!this.container || !this.enabled) return;

    const now = performance.now();
    const activeBursts: ParticleBurst[] = [];

    for (const burst of this.bursts) {
      const age = now - burst.createdAt;
      const activeParticles: Particle[] = [];

      for (const p of burst.particles) {
        const remaining = p.life - age;
        if (remaining <= 0) continue;

        // Update position
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        // Gravity
        p.vy -= 0.01;

        // Fade
        const lifeRatio = remaining / p.maxLife;
        const opacity = lifeRatio;
        const size = p.size * lifeRatio;

        // Create or update DOM element
        const id = `${p.x.toFixed(2)}-${p.y.toFixed(2)}-${p.z.toFixed(2)}-${burst.createdAt}`;
        let el = this.particleElements.get(id);

        if (!el) {
          el = document.createElement('div');
          el.style.cssText = `
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
            z-index: 5;
          `;
          this.container.appendChild(el);
          this.particleElements.set(id, el);
        }

        el.style.cssText = `
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate3d(${p.x * 10}px, ${-p.y * 10}px, ${p.z * 10}px);
          width: ${size}px;
          height: ${size}px;
          background: ${p.color};
          opacity: ${opacity};
          border-radius: 50%;
          pointer-events: none;
          z-index: 5;
          box-shadow: 0 0 ${size * 2}px ${p.color};
        `;

        activeParticles.push(p);
      }

      if (activeParticles.length > 0) {
        activeBursts.push({ particles: activeParticles, createdAt: burst.createdAt });
      }
    }

    this.bursts = activeBursts;
  }
}
