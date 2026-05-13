/**
 * Presentation domain - public API for Marble world rendering.
 * 
 * This module provides the mountWorld() function that orchestrates
 * the Three.js + Spark renderer for Gaussian splat scenes.
 * 
 * Adheres to: DRY (single owner), MODULAR (imperative handle pattern), 
 * PERFORMANT (adaptive quality), CLEAN (no outbound deps to game/tournament).
 */
import { type MarbleWorld } from '@/config/worlds';
import { WorldHost } from './world-host';
import { detectQualityTier } from './quality';
import { getCachedSplat, cacheSplat } from './splat-loader';
import { type CameraPreset } from './camera-rig';

export interface WorldHandle {
  /** Switch to a different world by ID */
  switchWorld(worldId: string): Promise<void>;
  /** Dispose and clean up resources */
  dispose(): void;
  /** Get current world ID */
  getWorldId(): string | null;
  /** Fly camera to preset position (plunger, overview, drain, side) */
  flyToPreset(preset: CameraPreset, options?: { duration?: number; onComplete?: () => void }): void;
  /** Fly camera to specific position */
  flyTo(position: [number, number, number], target: [number, number, number], options?: { duration?: number; onComplete?: () => void }): void;
}

interface WorldHostConfig {
  container: HTMLDivElement;
  world: MarbleWorld;
  qualityTier: 'low' | 'medium' | 'high';
  onProgress?: (progress: number) => void;
}

interface MountWorldOptions {
  /** Called with progress (0-1) as world loads */
  onProgress?: (progress: number) => void;
}

/**
 * Mount a Marble world behind the game canvas.
 * 
 * @param container - The DOM container for the 3D scene
 * @param world - The MarbleWorld definition to load
 * @param options - Optional configuration (e.g., progress callback)
 * @returns Promise<WorldHandle> - Imperative handle for controlling the world
 */
export async function mountWorld(
  container: HTMLDivElement,
  world: MarbleWorld,
  options?: MountWorldOptions
): Promise<WorldHandle> {
  // Detect quality tier based on device capabilities
  const qualityTier = detectQualityTier();
  
  // Try to load from cache first (performance optimization)
  const cachedUrl = await getCachedSplat(world.id, world.spzUrl);
  const splatUrl = cachedUrl || world.spzUrl;
  
  // Create the world host
  const host = new WorldHost();
  const config: WorldHostConfig = {
    container,
    world,
    qualityTier,
    onProgress: options?.onProgress,
  };
  
  await host.initialize(config);
  
  // If loaded from network, cache for next time
  if (!cachedUrl) {
    cacheSplat(world.id, world.spzUrl).catch(console.warn);
  }
  
  return {
    switchWorld: async (newWorldId: string) => {
      const newWorld = await host.loadWorldById(newWorldId);
      if (newWorld) {
        host.updateConfig({ world: newWorld });
      }
    },
    dispose: () => host.dispose(),
    getWorldId: () => world.id,
    flyToPreset: (preset, options) => host.flyToPreset(preset, options),
    flyTo: (position, target, options) => host.flyTo(position, target, options),
  };
}

/**
 * Check if the browser supports WebGL2 for splat rendering
 */
export function isSplatSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Check if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}