/**
 * Adaptive quality system for Marble world rendering.
 * 
 * Measures FPS during first frames and degrades gracefully if needed.
 * Supports reduced-motion preferences and device capability detection.
 */

export type QualityTier = 'low' | 'medium' | 'high';

interface QualityConfig {
  splatDensity: number;       // 0-1, lower = fewer splats rendered
  postProcessing: boolean;    // Enable/disable bloom, DOF, etc.
  ambientAudio: boolean;      // World ambience track
  maxFPS: number;             // Target FPS budget
  shadowQuality: 'none' | 'low' | 'high';
}

const QUALITY_CONFIGS: Record<QualityTier, QualityConfig> = {
  low: {
    splatDensity: 0.25,
    postProcessing: false,
    ambientAudio: false,
    maxFPS: 30,
    shadowQuality: 'none',
  },
  medium: {
    splatDensity: 0.5,
    postProcessing: true,
    ambientAudio: true,
    maxFPS: 45,
    shadowQuality: 'low',
  },
  high: {
    splatDensity: 1.0,
    postProcessing: true,
    ambientAudio: true,
    maxFPS: 60,
    shadowQuality: 'high',
  },
};

export function getQualityConfig(tier: QualityTier): QualityConfig {
  return QUALITY_CONFIGS[tier];
}

/**
 * Detect the appropriate quality tier based on device capabilities
 */
export function detectQualityTier(): QualityTier {
  // Check reduced motion preference first
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'low';
  }
  
  // Check for low memory devices
  if ('deviceMemory' in navigator) {
    const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
    if (memory < 4) return 'low';
  }
  
  // Check hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    return 'low';
  }
  
  // Check for mobile devices
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  if (isMobile) {
    return 'medium';
  }
  
  // Default to high for capable desktop machines
  return 'high';
}

/**
 * FPS Monitor for adaptive quality adjustment
 */
export class FPSMonitor {
  private frames: number[] = [];
  private lastTime: number = 0;
  private readonly sampleSize = 60; // Measure over 60 frames
  
  tick(): void {
    const now = performance.now();
    if (this.lastTime > 0) {
      const delta = now - this.lastTime;
      if (delta > 0) {
        this.frames.push(1000 / delta);
      }
    }
    this.lastTime = now;
    
    // Keep only the last N samples
    if (this.frames.length > this.sampleSize) {
      this.frames.shift();
    }
  }
  
  getAverageFPS(): number {
    if (this.frames.length === 0) return 60;
    return this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
  }
  
  shouldDegrade(currentTier: QualityTier): boolean {
    const avgFPS = this.getAverageFPS();
    const targetFPS = QUALITY_CONFIGS[currentTier].maxFPS;
    
    // Degrade if FPS drops below 80% of target for sustained period
    return avgFPS < targetFPS * 0.8 && this.frames.length >= this.sampleSize;
  }
  
  reset(): void {
    this.frames = [];
    this.lastTime = 0;
  }
}