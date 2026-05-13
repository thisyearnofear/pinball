/**
 * Camera rig - manages camera positions and smooth transitions for cinematic effects.
 * 
 * Provides preset positions (plunger, overview, drain) and flyTo() for smooth
 * animated camera transitions between balls.
 */

import { type MarbleWorld, type CameraPresets } from '@/config/worlds';

export type CameraPreset = 'plunger' | 'overview' | 'drain' | 'side';

interface CameraPosition {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

interface FlyToOptions {
  duration?: number;
  easing?: 'ease-in-out' | 'ease-out' | 'linear';
  onComplete?: () => void;
}

const DEFAULT_DURATION = 800;
const DEFAULT_PRESETS: Record<CameraPreset, CameraPosition> = {
  plunger: {
    position: [0, 2, 8],
    target: [0, 0, 0],
    fov: 50,
  },
  overview: {
    position: [0, 15, 15],
    target: [0, 0, 0],
    fov: 60,
  },
  drain: {
    position: [0, 1, 5],
    target: [0, -2, 0],
    fov: 45,
  },
  side: {
    position: [10, 5, 5],
    target: [0, 0, 0],
    fov: 55,
  },
};

export class CameraRig {
  private state: CameraState = {
    position: [0, 8, 12],
    target: [0, 0, 0],
    fov: 55,
  };
  private animation: {
    startTime: number;
    duration: number;
    startPos: [number, number, number];
    startTarget: [number, number, number];
    endPos: [number, number, number];
    endTarget: [number, number, number];
    easing: 'ease-in-out' | 'ease-out' | 'linear';
    onComplete?: () => void;
  } | null = null;
  private sparkCamera: unknown | null = null;
  private worldPresets: CameraPresets | null = null;

  /**
   * Initialize camera rig with world context
   */
  initialize(world?: MarbleWorld): void {
    this.worldPresets = world?.camera || null;
    this.setPreset('overview');
  }

  /**
   * Set the underlying Spark camera for updates
   */
  setSparkCamera(camera: unknown): void {
    this.sparkCamera = camera;
  }

  /**
   * Set to a preset camera position
   */
  setPreset(preset: CameraPreset, options?: FlyToOptions): void {
    // Try world-specific preset first, fall back to defaults
    let pos: CameraPosition | undefined;
    if (this.worldPresets && preset in this.worldPresets) {
      const worldPreset = this.worldPresets[preset as keyof CameraPresets];
      pos = {
        position: worldPreset.position,
        target: worldPreset.target,
        fov: 50,
      };
    }
    
    if (!pos) {
      pos = DEFAULT_PRESETS[preset];
    }
    
    if (!pos) {
      console.warn('Unknown camera preset:', preset);
      return;
    }
    this.flyTo(pos.position, pos.target, {
      duration: options?.duration ?? DEFAULT_DURATION,
      easing: options?.easing ?? 'ease-in-out',
      onComplete: options?.onComplete,
    });
  }

  /**
   * Fly to a specific position with smooth interpolation
   */
  flyTo(
    position: [number, number, number],
    target: [number, number, number],
    options?: FlyToOptions
  ): void {
    this.animation = {
      startTime: performance.now(),
      duration: options?.duration ?? DEFAULT_DURATION,
      startPos: [...this.state.position] as [number, number, number],
      startTarget: [...this.state.target] as [number, number, number],
      endPos: position,
      endTarget: target,
      easing: options?.easing ?? 'ease-in-out',
      onComplete: options?.onComplete,
    };
  }

  /**
   * Get current camera state (for external renderers)
   */
  getState(): CameraState {
    return { ...this.state };
  }

  /**
   * Update the camera (call each frame)
   */
  update(): void {
    if (!this.animation || !this.sparkCamera) return;

    const now = performance.now();
    const elapsed = now - this.animation.startTime;
    const t = Math.min(elapsed / this.animation.duration, 1);
    const eased = this.ease(t, this.animation.easing);

    this.state.position = this.lerp3(this.animation.startPos, this.animation.endPos, eased);
    this.state.target = this.lerp3(this.animation.startTarget, this.animation.endTarget, eased);

    this.applyToSparkCamera();

    if (t >= 1 && this.animation.onComplete) {
      this.animation.onComplete();
      this.animation = null;
    }
  }

  /**
   * Apply current state to Spark camera
   */
  private applyToSparkCamera(): void {
    if (!this.sparkCamera) return;
    
    const cam = this.sparkCamera as Record<string, unknown>;
    if (cam.position) {
      (cam.position as { x: number; y: number; z: number }).x = this.state.position[0];
      (cam.position as { x: number; y: number; z: number }).y = this.state.position[1];
      (cam.position as { x: number; y: number; z: number }).z = this.state.position[2];
    }
    if (cam.lookAt) {
      (cam.lookAt as Function)(this.state.target[0], this.state.target[1], this.state.target[2]);
    }
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
    return [
      this.lerp(a[0], b[0], t),
      this.lerp(a[1], b[1], t),
      this.lerp(a[2], b[2], t),
    ];
  }

  /**
   * Easing functions
   */
  private ease(t: number, type: 'ease-in-out' | 'ease-out' | 'linear'): number {
    switch (type) {
      case 'ease-out':
        return 1 - Math.pow(1 - t, 3);
      case 'ease-in-out':
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      case 'linear':
      default:
        return t;
    }
  }

  /**
   * Check if camera is animating
   */
  isAnimating(): boolean {
    return this.animation !== null && this.animation.duration > 0;
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.animation = null;
    this.sparkCamera = null;
    this.worldPresets = null;
  }
}