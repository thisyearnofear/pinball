/**
 * World host - manages Three.js + Spark lifecycle for Marble worlds.
 * 
 * This is the single owner of the Three.js renderer instance (DRY).
 * Handles initialization, world loading, camera management, and disposal.
 */

import { type MarbleWorld } from '@/config/worlds';
import { type QualityTier, getQualityConfig, FPSMonitor, QUALITY_TIERS } from './quality';
import { getOptimalSplatUrl, loadSplat } from './splat-loader';
import { CameraRig, type CameraPreset } from './camera-rig';
import { PostProcessingManager, getPostProcessingConfig } from './post-processing';

// SparkJS types - loaded dynamically via window.__loadSpark
interface SparkInstance {
  loadSplat(url: string, options?: Record<string, unknown>): Promise<unknown>;
  loadSplatFromArrayBuffer(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<unknown>;
  dispose(): void;
  getCamera(): unknown;
  render(): void;
  setQuality(tier: QualityTier): void;
}

// Declare global Spark on window (loaded via window.__loadSpark)
declare global {
  interface Window {
    Spark?: new (options: { container: HTMLElement; background?: boolean; maxFPS?: number }) => SparkInstance;
    __loadSpark?: () => Promise<unknown>;
  }
}

/**
 * WorldHost manages the lifecycle of a Marble world scene.
 */
export class WorldHost {
  private spark: SparkInstance | null = null;
  private container: HTMLDivElement | null = null;
  private currentWorld: MarbleWorld | null = null;
  private qualityTier: QualityTier = 'high';
  private initialized = false;
  private disposeFn: (() => void) | null = null;
  private onProgress: ((progress: number) => void) | null = null;
  private cameraRig: CameraRig | null = null;
  private rafId: number | null = null;
  private postProcessing: PostProcessingManager | null = null;
  private loadError: Error | null = null;
  private fpsMonitor: FPSMonitor | null = null;
  private onQualityChange: ((tier: QualityTier) => void) | null = null;

  /**
   * Initialize the world host with a container and initial world
   */
  async initialize(config: WorldHostConfig): Promise<void> {
    this.container = config.container;
    this.currentWorld = config.world;
    this.qualityTier = config.qualityTier;
    this.onProgress = config.onProgress ?? null;
    this.onQualityChange = config.onQualityChange ?? null;
    
    const qualityConfig = getQualityConfig(this.qualityTier);
    
    // Dynamically load SparkJS if not already loaded
    if (window.__loadSpark) {
      try {
        await window.__loadSpark();
      } catch (e) {
        console.warn('Failed to load SparkJS:', e);
        this.initialized = false;
        return;
      }
    }
    
    // Wait for SparkJS to be available on window
    if (window.Spark) {
      this.spark = new window.Spark({
        container: this.container!,
        background: false,
        maxFPS: qualityConfig.maxFPS,
      });
      
      this.cameraRig = new CameraRig();
      this.cameraRig.initialize(config.world);
      this.cameraRig.setSparkCamera(this.spark.getCamera());
      
      // Initialize post-processing
      this.postProcessing = new PostProcessingManager();
      this.postProcessing.initialize(this.container!);
      this.postProcessing.setConfig(getPostProcessingConfig(this.qualityTier));
      
      // Initialize FPS monitor for adaptive quality
      this.fpsMonitor = new FPSMonitor();
      
      this.startRenderLoop();
      this.initialized = true;
      console.log('WorldHost initialized with quality tier:', this.qualityTier);
      
      // Load the initial world
      await this.loadWorld(config.world);
    } else {
      console.warn('SparkJS not available - world rendering disabled');
      this.initialized = false;
    }
  }

  /**
   * Load a Marble world
   */
  async loadWorld(world: MarbleWorld): Promise<void> {
    if (!this.spark || !this.initialized) {
      console.warn('WorldHost not initialized, skipping world load');
      return;
    }
    
    this.currentWorld = world;
    const url = getOptimalSplatUrl(world, this.qualityTier);

    // Report initial progress
    this.onProgress?.(0.1);

    try {
      await this.spark.loadSplat(url, {
        position: world.position,
        rotation: world.rotation,
        scale: world.scale,
      });
      
      // Report completion
      this.onProgress?.(1);
      this.loadError = null;
      console.log('Loaded world:', world.name, 'from', url);
    } catch (e) {
      this.loadError = e instanceof Error ? e : new Error(String(e));
      console.error('Failed to load world:', world.name, this.loadError);
      this.onProgress?.(-1); // Negative progress indicates error
    }
  }

  /**
   * Get load error if world failed to load
   */
  getLoadError(): Error | null {
    return this.loadError;
  }

  /**
   * Load a world by its ID (looks up from MARBLE_WORLDS config)
   */
  async loadWorldById(worldId: string): Promise<MarbleWorld | null> {
    // Import the worlds config dynamically to avoid circular deps
    const { MARBLE_WORLDS } = await import('@/config/worlds');
    
    const world = MARBLE_WORLDS[worldId.toUpperCase()] || 
                  Object.values(MARBLE_WORLDS).find(w => w.id === worldId);
    
    if (world) {
      await this.loadWorld(world);
      return world;
    }
    
    console.warn('World not found:', worldId);
    return null;
  }

  /**
   * Update the host configuration
   */
  updateConfig(config: Partial<WorldHostConfig>): void {
    if (config.world) {
      this.loadWorld(config.world);
    }
    if (config.qualityTier) {
      this.qualityTier = config.qualityTier;
      if (this.spark) {
        this.spark.setQuality(this.qualityTier);
      }
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stopRenderLoop();
    
    if (this.spark) {
      this.spark.dispose();
      this.spark = null;
    }
    
    if (this.cameraRig) {
      this.cameraRig.dispose();
      this.cameraRig = null;
    }
    
    if (this.postProcessing) {
      this.postProcessing.dispose();
      this.postProcessing = null;
    }
    
    this.fpsMonitor = null;
    this.onQualityChange = null;
    
    if (this.disposeFn) {
      this.disposeFn();
      this.disposeFn = null;
    }
    
    this.container = null;
    this.currentWorld = null;
    this.initialized = false;
  }

  /**
   * Get the current world
   */
  getCurrentWorld(): MarbleWorld | null {
    return this.currentWorld;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Fly camera to a preset position (cinematic transition)
   */
  flyToPreset(preset: CameraPreset, options?: { duration?: number; onComplete?: () => void }): void {
    this.cameraRig?.setPreset(preset, options);
  }

  /**
   * Fly camera to specific position/target
   */
  flyTo(
    position: [number, number, number],
    target: [number, number, number],
    options?: { duration?: number; onComplete?: () => void }
  ): void {
    this.cameraRig?.flyTo(position, target, options);
  }

  /**
   * Enable/disable ball-following camera mode
   */
  setBallTracking(enabled: boolean): void {
    this.cameraRig?.setBallTracking(enabled);
  }

  /**
   * Update ball position for camera tracking
   */
  updateBallPosition(gameX: number, gameY: number): void {
    this.cameraRig?.updateBallPosition(gameX, gameY);
  }

  /**
   * Pause ball tracking (e.g., during cinematic transitions)
   */
  pauseBallTracking(paused: boolean): void {
    this.cameraRig?.pauseBallTracking(paused);
  }

/**
    * Start the render loop
    */
  private startRenderLoop(): void {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    
    const loop = () => {
      this.fpsMonitor?.tick();
      this.cameraRig?.update();
      if (this.spark) {
        this.spark.render();
      }
      
      // Check for quality degradation
      if (this.fpsMonitor && this.spark) {
        const newTier = this.fpsMonitor.getDegradeTier(this.qualityTier);
        if (newTier) {
          this.qualityTier = newTier;
          this.spark.setQuality(this.qualityTier);
          this.postProcessing?.setConfig(getPostProcessingConfig(this.qualityTier));
          this.fpsMonitor.reset();
          console.log('Quality degraded to:', this.qualityTier);
          this.onQualityChange?.(this.qualityTier);
        }
      }
      
      this.rafId = requestAnimationFrame(loop);
    };
    
    this.rafId = requestAnimationFrame(loop);
    
    if (isMobile) {
      setTimeout(() => {
        this.cameraRig?.setPreset('overview', { duration: 0 });
      }, 100);
    }
  }

  /**
   * Stop the render loop
   */
  private stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

interface WorldHostConfig {
  container: HTMLDivElement;
  world: MarbleWorld;
  qualityTier: QualityTier;
  onProgress?: (progress: number) => void;
  onQualityChange?: (tier: QualityTier) => void;
}