/**
 * Splat loader with caching support for Marble worlds.
 * 
 * Handles .spz and .rad (LOD) formats with Cache Storage API.
 * Implements DRY: single source of truth for splat loading.
 */

import { type MarbleWorld } from '@/config/worlds';

const CACHE_NAME = 'pinball-splats-v1';

/**
 * Get cached splat URL if available, otherwise return original URL
 */
export async function getCachedSplat(
  worldId: string,
  url: string
): Promise<string | null> {
  if (!('caches' in window)) return null;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    
    if (response) {
      console.log(`Splat cache hit for ${worldId}`);
      return response.url;
    }
  } catch (e) {
    console.warn('Cache not available:', e);
  }
  
  return null;
}

/**
 * Cache a splat for future use
 */
export async function cacheSplat(
  worldId: string,
  url: string
): Promise<void> {
  if (!('caches' in window)) return;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(url);
    
    if (response.ok) {
      await cache.put(url, response.clone());
      console.log(`Cached splat for ${worldId}`);
    }
  } catch (e) {
    console.warn('Failed to cache splat:', e);
  }
}

/**
 * Load a splat file with progress tracking
 */
export async function loadSplat(
  url: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    
    xhr.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = event.loaded / event.total;
        onProgress(progress);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.response);
      } else {
        reject(new Error(`Failed to load splat: ${xhr.statusText}`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error loading splat'));
    };
    
    xhr.send();
  });
}

/**
 * Select optimal splat URL based on quality tier and world size
 */
export function getOptimalSplatUrl(
  world: MarbleWorld,
  qualityTier: 'low' | 'medium' | 'high'
): string {
  // Prefer .rad (LOD) for high quality on large scenes
  if (world.radUrl && qualityTier === 'high') {
    return world.radUrl;
  }
  
  // Default to .spz (optimized for web)
  return world.spzUrl;
}

/**
 * Estimate splat download time based on URL and connection
 */
export function estimateDownloadTime(url: string): number {
  // Rough estimates based on typical splat sizes
  if (url.includes('.rad')) {
    // Large LOD files: 50-350 MB
    return 120; // seconds
  }
  
  // .spz files: 30-350 MB
  return 60; // seconds
}