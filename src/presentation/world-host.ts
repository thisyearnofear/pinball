/**
 * World host - manages Three.js + Spark lifecycle for Marble worlds.
 * 
 * This is the single owner of the Three.js renderer instance (DRY).
 * Handles initialization, world loading, camera management, and disposal.
 */

import { type MarbleWorld } from '@/config/worlds';
import { type QualityTier, getQualityConfig } from './quality';
import { getOptimalSplatUrl, loadSplat } from './splat-loader';
import { CameraRig, type CameraPreset } from './camera-rig';

// SparkJS types - loaded via CDN in index.html
interface SparkInstance {
  loadSplat(url: string, options?: Record<string, unknown>): Promise<unknown>;
  loadSplatFromArrayBuffer(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<unknown>;
  dispose(): void;
  getCamera(): unknown;
  render(): void;
  setQuality(tier: QualityTier): void;
}

interface ThreeScene {
  add(object: unknown): void;
  remove(object: unknown): void;
}

// Declare global Spark on window (loaded via CDN in index.html)
declare global {
  interface Window {
    Spark?: new (options: { container: HTMLElement; background?: boolean; maxFPS?: number }) => SparkInstance;
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

  /**
   * Initialize the world host with a container and initial world
   */
  async initialize(config: WorldHostConfig): Promise<void> {
    this.container = config.container;
    this.currentWorld = config.world;
    this.qualityTier = config.qualityTier;
    this.onProgress = config.onProgress ?? null;
    
    const qualityConfig = getQualityConfig(this.qualityTier);
    
    // Wait for SparkJS to be available on window (loaded via CDN in index.html)
    if (window.Spark) {
      this.spark = new window.Spark({
        container: this.container!,
        background: false,
        maxFPS: qualityConfig.maxFPS,
      });
      
      this.cameraRig = new CameraRig();
      this.cameraRig.initialize(config.world);
      this.cameraRig.setSparkCamera(this.spark.getCamera());
      
      this.startRenderLoop();
      this.initialized = true;
      console.log('WorldHost initialized with quality tier:', this.qualityTier);
      
      // Load the initial world
      await this.loadWorld(config.world);
    } else {
      console.warn('SparkJS not loaded via CDN - world rendering disabled');
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
      console.log('Loaded world:', world.name, 'from', url);
    } catch (e) {
      console.error('Failed to load world:', world.name, e);
    }
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
   * Start the render loop
   */
  private startRenderLoop(): void {
    const loop = () => {
      this.cameraRig?.update();
      if (this.spark) {
        this.spark.render();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
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
}