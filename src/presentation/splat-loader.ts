/**
 * Splat URL selection for Marble worlds.
 *
 * SplatMesh (the Spark 2.0 loader primitive) handles its own fetching,
 * decoding, and LOD-streaming via an internal worker; we don't pre-fetch or
 * pre-cache. This module keeps just the single rule for picking the right
 * URL for the requested quality tier — the rest of the loader API from the
 * pre-rewrite codebase is dead.
 */

import { type MarbleWorld } from "@/config/worlds";

/**
 * Select optimal splat URL based on quality tier.
 *
 * High tier prefers `.rad` (LOD streaming, better detail on capable GPUs).
 * Lower tiers fall back to `.spz` (single-buffer, lower VRAM peak).
 */
export function getOptimalSplatUrl(
  world: MarbleWorld,
  qualityTier: "low" | "medium" | "high",
): string {
  if (world.radUrl && qualityTier === "high") {
    return world.radUrl;
  }
  return world.spzUrl ?? world.radUrl ?? "";
}

/**
 * Estimate splat download time based on URL and connection.
 *
 * Kept for the lobby's "estimated download" UI; the actual loader is now
 * SplatMesh (does not expose this signal yet, so the estimate is approximate).
 */
export function estimateDownloadTime(url: string): number {
  if (url.includes(".rad")) {
    // Large LOD files: 50-350 MB.
    return 120;
  }
  // .spz files: 30-350 MB.
  return 60;
}
