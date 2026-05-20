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
import { detectQualityTier, type QualityTier } from './quality';
import { getCachedSplat, cacheSplat } from './splat-loader';
import { type CameraPreset } from './camera-rig';
import { WorldAmbienceManager } from './world-ambience';
import { type WorldReaction } from './world-reactor';

export interface WorldHandle {
  switchWorld(worldId: string): Promise<void>;
  dispose(): void;
  getWorldId(): string | null;
  flyToPreset(preset: CameraPreset, options?: { duration?: number; onComplete?: () => void }): void;
  flyTo(position: [number, number, number], target: [number, number, number], options?: { duration?: number; onComplete?: () => void }): void;
  getLoadError(): Error | null;
  duckAmbience(durationMs?: number): void;
  setAmbienceMuted(muted: boolean): void;
  getCurrentQuality(): QualityTier;
  setBallTracking(enabled: boolean): void;
  updateBallPosition(gameX: number, gameY: number): void;
  pauseBallTracking(paused: boolean): void;
  updateReactor(score: number, isMultiball: boolean): void;
  getReactionIntensity(): number;
  triggerImpact(intensity?: number): void;
  resetReactor(): void;
  setOnWorldReaction(callback: (reaction: WorldReaction) => void): void;
  updateBallLight(gameX: number, gameY: number, velocity: number): void;
  spawnParticles(worldX: number, worldY: number, worldZ: number, config?: Record<string, unknown>): void;
  spawnBumperParticles(worldX: number, worldY: number, worldZ: number, color: string): void;
}

interface WorldHostConfig {
  container: HTMLDivElement;
  world: MarbleWorld;
  qualityTier: 'low' | 'medium' | 'high';
  onProgress?: (progress: number) => void;
  onQualityChange?: (tier: QualityTier) => void;
}

interface MountWorldOptions {
  onProgress?: (progress: number) => void;
  onQualityChange?: (tier: QualityTier) => void;
}

export async function mountWorld(
  container: HTMLDivElement,
  world: MarbleWorld,
  options?: MountWorldOptions
): Promise<WorldHandle> {
  const qualityTier = detectQualityTier();
  const cachedUrl = await getCachedSplat(world.id, world.spzUrl);
  
  const host = new WorldHost();
  const ambience = new WorldAmbienceManager();
  let currentQuality: QualityTier = qualityTier;
  
  const config: WorldHostConfig = {
    container,
    world,
    qualityTier,
    onProgress: options?.onProgress,
    onQualityChange: (tier) => {
      currentQuality = tier;
      options?.onQualityChange?.(tier);
    },
  };
  
  try {
    await host.initialize(config);
    
    if (!cachedUrl) {
      cacheSplat(world.id, world.spzUrl).catch(console.warn);
    }
    
    if (world.ambienceUrl) {
      ambience.loadWorld(world.id, world.ambienceUrl).catch(console.warn);
    }
  } catch (initError) {
    console.error('World host initialization failed:', initError);
    host.dispose();
    ambience.dispose();
    throw initError;
  }
  
  return {
    switchWorld: async (newWorldId: string) => {
      const newWorld = await host.loadWorldById(newWorldId);
      if (newWorld) {
        host.updateConfig({ world: newWorld });
        if (newWorld.ambienceUrl) {
          ambience.loadWorld(newWorld.id, newWorld.ambienceUrl).catch(console.warn);
        }
      }
    },
    dispose: () => {
      host.dispose();
      ambience.dispose();
    },
    getWorldId: () => world.id,
    flyToPreset: (preset, options) => host.flyToPreset(preset, options),
    flyTo: (position, target, options) => host.flyTo(position, target, options),
    getLoadError: () => host.getLoadError(),
    duckAmbience: (durationMs) => ambience.duck(durationMs),
    setAmbienceMuted: (muted) => ambience.setMuted(muted),
    getCurrentQuality: () => currentQuality,
    setBallTracking: (enabled) => host.setBallTracking(enabled),
    updateBallPosition: (gameX, gameY) => host.updateBallPosition(gameX, gameY),
    pauseBallTracking: (paused) => host.pauseBallTracking(paused),
    updateReactor: (score, isMultiball) => host.updateReactor(score, isMultiball),
    getReactionIntensity: () => host.getReactionIntensity(),
    triggerImpact: (intensity) => host.triggerImpact(intensity),
    resetReactor: () => host.resetReactor(),
    setOnWorldReaction: (callback) => host.setOnWorldReaction(callback),
    updateBallLight: (gameX, gameY, velocity) => host.updateBallLight(gameX, gameY, velocity),
    spawnParticles: (worldX, worldY, worldZ, config) => host.spawnParticles(worldX, worldY, worldZ, config),
    spawnBumperParticles: (worldX, worldY, worldZ, color) => host.spawnBumperParticles(worldX, worldY, worldZ, color),
  };
}

export function isSplatSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}