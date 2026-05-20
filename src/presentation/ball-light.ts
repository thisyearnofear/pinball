/**
 * Ball Light - Point light that follows the ball in the 3D world.
 * 
 * Creates a dynamic light source at the ball's position that illuminates
 * nearby splat geometry. Color shifts based on ball velocity.
 */

interface LightState {
  x: number;
  y: number;
  z: number;
  intensity: number;
  color: string;
}

export interface BallLightConfig {
  enabled: boolean;
  intensity: number;
  radius: number;
  warmColor: string;
  coolColor: string;
  warmThreshold: number;
  coolThreshold: number;
}

const DEFAULT_CONFIG: BallLightConfig = {
  enabled: true,
  intensity: 1.5,
  radius: 8,
  warmColor: '#ffaa44',
  coolColor: '#4488ff',
  warmThreshold: 5,
  coolThreshold: 15,
};

export class BallLight {
  private config: BallLightConfig;
  private state: LightState = { x: 0, y: 0, z: 0, intensity: 0, color: '#ffffff' };
  private lightElement: HTMLDivElement | null = null;
  private container: HTMLDivElement | null = null;
  private animationId: number | null = null;
  private targetState: LightState = { x: 0, y: 0, z: 0, intensity: 0, color: '#ffffff' };

  constructor(config?: Partial<BallLightConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize ball light with a container
   */
  initialize(container: HTMLDivElement): void {
    this.container = container;

    if (this.config.enabled) {
      this.lightElement = document.createElement('div');
      this.lightElement.style.cssText = `
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        z-index: 2;
        mix-blend-mode: screen;
        transition: none;
      `;
      container.appendChild(this.lightElement);
      this.startRenderLoop();
    }
  }

  /**
   * Enable/disable ball light
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled && this.lightElement) {
      this.lightElement.style.opacity = '0';
    }
  }

  /**
   * Update ball position and velocity
   */
  updatePosition(
    gameX: number,
    gameY: number,
    velocity: number = 0
  ): void {
    if (!this.config.enabled) return;

    // Map game coordinates to world space
    const worldX = ((gameX / 600) - 0.5) * 20;
    const worldZ = ((gameY / 800) - 0.5) * 20;

    // Calculate color based on velocity
    let color = this.config.warmColor;
    if (velocity > this.config.coolThreshold) {
      color = this.config.coolColor;
    } else if (velocity > this.config.warmThreshold) {
      // Interpolate between warm and cool
      const t = (velocity - this.config.warmThreshold) / (this.config.coolThreshold - this.config.warmThreshold);
      color = lerpColor(this.config.warmColor, this.config.coolColor, t);
    }

    // Intensity based on velocity
    const intensity = Math.min(this.config.intensity, 0.5 + velocity * 0.05);

    this.targetState = {
      x: worldX,
      y: 2,
      z: worldZ,
      intensity,
      color,
    };
  }

  /**
   * Set intensity multiplier
   */
  setIntensityMultiplier(multiplier: number): void {
    this.config.intensity = DEFAULT_CONFIG.intensity * multiplier;
  }

  /**
   * Dispose ball light
   */
  dispose(): void {
    this.stopRenderLoop();
    if (this.lightElement) {
      this.lightElement.remove();
      this.lightElement = null;
    }
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
    if (!this.lightElement || !this.config.enabled) return;

    // Smooth interpolation to target
    const smoothness = 0.15;
    this.state.x = lerp(this.state.x, this.targetState.x, smoothness);
    this.state.y = lerp(this.state.y, this.targetState.y, smoothness);
    this.state.z = lerp(this.state.z, this.targetState.z, smoothness);
    this.state.intensity = lerp(this.state.intensity, this.targetState.intensity, smoothness);
    this.state.color = this.targetState.color;

    const size = this.config.radius * (0.5 + this.state.intensity * 0.5);
    const opacity = Math.min(0.6, this.state.intensity * 0.4);

    this.lightElement.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate3d(${this.state.x * 15}px, ${-this.state.y * 15}px, ${this.state.z * 15}px);
      width: ${size * 10}px;
      height: ${size * 10}px;
      background: radial-gradient(circle, ${this.state.color}44 0%, ${this.state.color}00 70%);
      opacity: ${opacity};
      border-radius: 50%;
      pointer-events: none;
      z-index: 2;
      mix-blend-mode: screen;
      box-shadow: 0 0 ${size * 20}px ${this.state.color}33;
    `;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);

  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
