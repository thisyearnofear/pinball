/**
 * Post-processing pipeline for Marble world rendering.
 * 
 * Provides visual effects like DOF, bloom, vignette, and color grading.
 * Falls back to CSS-based effects when WebGL post-processing isn't available.
 */

import { type QualityTier, getQualityConfig } from './quality';

export interface PostProcessingConfig {
  enabled: boolean;
  dof: DOFConfig;
  bloom: BloomConfig;
  vignette: VignetteConfig;
  colorGrading: ColorGradingConfig;
}

export interface DOFConfig {
  enabled: boolean;
  focusDistance: number;  // 0-1, distance from camera
  aperture: number;       // 0-1, depth of field intensity
  maxBlur: number;        // Max blur radius in pixels
}

export interface BloomConfig {
  enabled: boolean;
  strength: number;      // 0-3, bloom intensity
  radius: number;         // 0-1, bloom spread
  threshold: number;      // 0-1, luminance threshold
}

export interface VignetteConfig {
  enabled: boolean;
  offset: number;        // 0-1, darkness offset
  darkness: number;      // 0-1, darkness intensity
}

export interface ColorGradingConfig {
  enabled: boolean;
  exposure: number;      // -1 to 1
  contrast: number;      // -1 to 1
  saturation: number;    // -1 to 1
  temperature: number;   // -1 (cool) to 1 (warm)
}

const DEFAULT_CONFIG: PostProcessingConfig = {
  enabled: true,
  dof: {
    enabled: false,
    focusDistance: 0.5,
    aperture: 0.5,
    maxBlur: 0.1,
  },
  bloom: {
    enabled: true,
    strength: 0.5,
    radius: 0.4,
    threshold: 0.85,
  },
  vignette: {
    enabled: true,
    offset: 0.5,
    darkness: 0.4,
  },
  colorGrading: {
    enabled: true,
    exposure: 0,
    contrast: 0.05,
    saturation: 0.1,
    temperature: 0,
  },
};

const QUALITY_CONFIGS: Record<QualityTier, Partial<PostProcessingConfig>> = {
  low: {
    enabled: true,
    dof: { enabled: false, focusDistance: 0.5, aperture: 0.5, maxBlur: 0 },
    bloom: { enabled: false, strength: 0, radius: 0, threshold: 1 },
    vignette: { enabled: true, offset: 0.6, darkness: 0.3 },
    colorGrading: { enabled: false, exposure: 0, contrast: 0, saturation: 0, temperature: 0 },
  },
  medium: {
    enabled: true,
    dof: { enabled: false, focusDistance: 0.5, aperture: 0.5, maxBlur: 0 },
    bloom: { enabled: true, strength: 0.3, radius: 0.4, threshold: 0.85 },
    vignette: { enabled: true, offset: 0.5, darkness: 0.4 },
    colorGrading: { enabled: true, exposure: 0, contrast: 0.05, saturation: 0.1, temperature: 0 },
  },
  high: {
    enabled: true,
    dof: { enabled: false, focusDistance: 0.5, aperture: 0.5, maxBlur: 0 },
    bloom: { enabled: true, strength: 0.5, radius: 0.4, threshold: 0.85 },
    vignette: { enabled: true, offset: 0.5, darkness: 0.4 },
    colorGrading: { enabled: true, exposure: 0, contrast: 0.05, saturation: 0.1, temperature: 0 },
  },
};

/**
 * Get post-processing config for a quality tier
 */
export function getPostProcessingConfig(tier: QualityTier): PostProcessingConfig {
  const qualityMods = QUALITY_CONFIGS[tier];
  
  return {
    enabled: qualityMods.enabled ?? DEFAULT_CONFIG.enabled,
    dof: { ...DEFAULT_CONFIG.dof, ...qualityMods.dof },
    bloom: { ...DEFAULT_CONFIG.bloom, ...qualityMods.bloom },
    vignette: { ...DEFAULT_CONFIG.vignette, ...qualityMods.vignette },
    colorGrading: { ...DEFAULT_CONFIG.colorGrading, ...qualityMods.colorGrading },
  };
}

/**
 * PostProcessingManager - applies CSS-based post-processing effects
 * 
 * Uses CSS filters and pseudo-elements for effects that work across browsers.
 * For advanced effects (DOF, real bloom), WebGL post-processing is required.
 */
export class PostProcessingManager {
  private container: HTMLDivElement | null = null;
  private overlayElement: HTMLDivElement | null = null;
  private config: PostProcessingConfig = DEFAULT_CONFIG;
  private disposed = false;

  /**
   * Initialize post-processing with a container
   */
  initialize(container: HTMLDivElement): void {
    this.container = container;
    
    // Create overlay for vignette and effects
    this.overlayElement = document.createElement('div');
    this.overlayElement.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    `;
    container.appendChild(this.overlayElement);
    
    this.applyConfig(this.config);
  }

  /**
   * Update post-processing configuration
   */
  setConfig(config: Partial<PostProcessingConfig>): void {
    this.config = { ...this.config, ...config };
    this.applyConfig(this.config);
  }

  /**
   * Apply current configuration to DOM
   */
  private applyConfig(config: PostProcessingConfig): void {
    if (!this.overlayElement) return;

    const effects: string[] = [];

    // Vignette effect via radial gradient
    if (config.vignette.enabled) {
      const darkness = config.vignette.darkness;
      const offset = config.vignette.offset;
      this.overlayElement.style.background = `radial-gradient(
        ellipse at center,
        transparent ${(1 - offset) * 50}%,
        rgba(0, 0, 0, ${darkness}) 100%
      )`;
    } else {
      this.overlayElement.style.background = 'transparent';
    }

    // Color grading via CSS filter
    if (config.colorGrading.enabled) {
      const { exposure, contrast, saturation, temperature } = config.colorGrading;
      
      // Apply brightness for exposure
      const brightness = 1 + exposure;
      const saturate = 1 + saturation;
      const contrast_val = 1 + contrast;
      
      let filter = `brightness(${brightness}) saturate(${saturate}) contrast(${contrast_val})`;
      
      // Temperature via hue-rotate (subtle)
      if (temperature !== 0) {
        filter += ` hue-rotate(${temperature * 20}deg)`;
      }
      
      this.overlayElement.style.filter = filter;
    } else {
      this.overlayElement.style.filter = 'none';
    }

    // Bloom simulation via box-shadow on container (subtle glow)
    if (config.bloom.enabled) {
      const strength = config.bloom.strength;
      // We can't do real bloom with CSS, but we can add subtle glow
      this.container!.style.boxShadow = `inset 0 0 ${strength * 30}px rgba(255, 255, 255, ${strength * 0.1})`;
    } else {
      this.container!.style.boxShadow = 'none';
    }
  }

  /**
   * Apply DOF blur effect (CSS-based fallback)
   * Note: Real DOF requires WebGL post-processing
   */
  applyDOF(_focusDistance: number, blur: number): void {
    if (!this.overlayElement) return;
    
    // CSS backdrop-filter blur can simulate soft DOF edges
    // But for splats, we mainly want to keep focus sharp
    if (blur > 0 && this.config.dof.enabled) {
      this.overlayElement.style.backdropFilter = `blur(${blur}px)`;
    } else {
      this.overlayElement.style.backdropFilter = 'none';
    }
  }

  /**
   * Reset all effects
   */
  reset(): void {
    if (this.overlayElement) {
      this.overlayElement.style.background = 'transparent';
      this.overlayElement.style.filter = 'none';
      this.overlayElement.style.backdropFilter = 'none';
    }
    if (this.container) {
      this.container.style.boxShadow = 'none';
    }
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.disposed = true;
    this.reset();
    
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.container = null;
  }
}