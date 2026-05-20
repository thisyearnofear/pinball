/**
 * Camera rig - manages camera positions and smooth transitions for cinematic effects.
 * 
 * Provides preset positions (plunger, overview, drain), flyTo() for smooth
 * animated camera transitions, and ball-following mode for real-time tracking.
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

interface BallTrackingConfig {
  enabled: boolean;
  gameWidth: number;
  gameHeight: number;
  worldOffsetX: number;
  worldOffsetY: number;
  worldScale: number;
  cameraHeight: number;
  cameraDistance: number;
  smoothness: number;
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

const DEFAULT_BALL_TRACKING: BallTrackingConfig = {
  enabled: false,
  gameWidth: 600,
  gameHeight: 800,
  worldOffsetX: 0,
  worldOffsetY: 0,
  worldScale: 0.02,
  cameraHeight: 6,
  cameraDistance: 8,
  smoothness: 0.08,
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
  
  private ballTracking: BallTrackingConfig = { ...DEFAULT_BALL_TRACKING };
  private ballWorldPos: [number, number, number] = [0, 0, 0];
  private ballTrackingActive = false;
  private ballTrackingPaused = false;

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
   * Enable/disable ball-following camera mode
   */
  setBallTracking(enabled: boolean, config?: Partial<BallTrackingConfig>): void {
    this.ballTracking = { ...this.ballTracking, ...config, enabled };
    this.ballTrackingActive = enabled;
    this.ballTrackingPaused = false;
    
    if (enabled) {
      this.cancelAnimation();
    }
  }

  /**
   * Pause ball tracking (e.g., during cinematic transitions)
   */
  pauseBallTracking(paused: boolean): void {
    this.ballTrackingPaused = paused;
  }

  /**
   * Update the ball position from the game engine
   * Called each frame with the ball's physics coordinates
   */
  updateBallPosition(gameX: number, gameY: number): void {
    if (!this.ballTracking.enabled) return;
    
    const { gameWidth, gameHeight, worldOffsetX, worldOffsetY, worldScale } = this.ballTracking;
    
    // Map game coordinates (600x800, y-down) to world space
    const worldX = ((gameX / gameWidth) - 0.5) * worldScale * 100 + worldOffsetX;
    const worldZ = ((gameY / gameHeight) - 0.5) * worldScale * 100 + worldOffsetY;
    
    this.ballWorldPos = [worldX, 0, worldZ];
  }

  /**
   * Set to a preset camera position
   */
  setPreset(preset: CameraPreset, options?: FlyToOptions): void {
    // Pause ball tracking during cinematic transitions
    this.ballTrackingPaused = true;
    
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
      onComplete: () => {
        // Resume ball tracking after transition completes
        if (this.ballTracking.enabled) {
          this.ballTrackingPaused = false;
        }
        options?.onComplete?.();
      },
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
   * Cancel any ongoing animation
   */
  private cancelAnimation(): void {
    this.animation = null;
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
    // Handle ball tracking mode
    if (this.ballTrackingActive && !this.ballTrackingPaused && this.ballTracking.enabled) {
      this.updateBallTracking();
      this.applyToSparkCamera();
      return;
    }
    
    // Handle preset animation
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
   * Update camera to follow the ball with smooth interpolation
   */
  private updateBallTracking(): void {
    if (!this.sparkCamera) return;
    
    const { cameraHeight, cameraDistance, smoothness } = this.ballTracking;
    const [bx, by, bz] = this.ballWorldPos;
    
    // Camera position: behind and above the ball
    const targetPos: [number, number, number] = [
      bx,
      by + cameraHeight,
      bz + cameraDistance,
    ];
    
    // Camera target: the ball position
    const targetLookAt: [number, number, number] = [bx, by, bz];
    
    // Smooth interpolation (exponential smoothing for fluid tracking)
    this.state.position[0] = this.lerp(this.state.position[0], targetPos[0], smoothness);
    this.state.position[1] = this.lerp(this.state.position[1], targetPos[1], smoothness);
    this.state.position[2] = this.lerp(this.state.position[2], targetPos[2], smoothness);
    
    this.state.target[0] = this.lerp(this.state.target[0], targetLookAt[0], smoothness * 1.5);
    this.state.target[1] = this.lerp(this.state.target[1], targetLookAt[1], smoothness * 1.5);
    this.state.target[2] = this.lerp(this.state.target[2], targetLookAt[2], smoothness * 1.5);
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
   * Check if ball tracking is active
   */
  isBallTracking(): boolean {
    return this.ballTrackingActive && this.ballTracking.enabled && !this.ballTrackingPaused;
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.animation = null;
    this.sparkCamera = null;
    this.worldPresets = null;
    this.ballTrackingActive = false;
  }
}
