 /**
  * We pin to three@0.186.0 — the version Spark 2.0's shaders were compiled
  * against. Newer THREE versions break internal chunk lookups like
  * `#include <splatDefines>`.
 */
declare module "sparkjs-2" {
  import * as THREE from "three";

  export interface PagedSplatsOptions {
    rootUrl?: string;
    pager?: SplatPager;
    fileBytes?: Uint8Array;
    fileType?: SplatFileType;
    requestHeader?: Record<string, string>;
    withCredentials?: boolean;
  }

  export class PagedSplats {
    constructor(options: PagedSplatsOptions);
    readonly rootUrl: string;
    dispose(): void;
    setMaxSh(maxSh: number): void;
  }

  export class SplatPager {
    constructor(options: { renderer: THREE.WebGLRenderer; extSplats?: boolean });
    fetchPause: number;
    pageSplats: number;
    maxPages: number;
    driveFetchers(): void;
  }

  export const enum SplatFileType {
    SPZ = "spz",
    PLY = "ply",
    RAD = "rad",
    KSPLAT = "ksplat",
  }

  export interface SplatMeshOptions {
    /** Splat asset URL. Detected by extension when both `url` and `paged` are set. */
    url?: string;
    /** Raw splat bytes (alternative to `url`). */
    fileBytes?: Uint8Array;
    /** True to load a paged `.rad`; can also pass an existing PagedSplats or SplatPager. */
    paged?: boolean | PagedSplats | SplatPager;
    /** Force ext-splats mode on the SparkRenderer when used with `paged`. */
    extSplats?: boolean;
    /** Per-splat maximum spherical-harmonic degree (0-3). */
    maxSh?: number;
    /** Splat loading is async; this promise resolves once the worker is done. */
    onLoad?: (mesh: SplatMesh) => void | Promise<void>;
  }

  /**
   * SplatMesh extends THREE.Object3D — it's a regular scene-graph node whose
   * shader draws Gaussian splats. We assign `position` / `rotation` / `scale`
   * the same way you would for any THREE.Mesh.
   */
  export class SplatMesh extends THREE.Object3D {
    constructor(options?: SplatMeshOptions);
    /** Resolves once the SplatLoader worker finishes decoding. */
    readonly initialized: Promise<this>;
    isInitialized: boolean;
    /** Releases GPU resources held by the underlying splat data. */
    dispose(): void;
  }

  export interface SparkRendererOptions {
    /** The host WebGLRenderer; Spark hooks into its onBeforeRender. */
    renderer: THREE.WebGLRenderer;
    /** Maximum splats for LOD paging. Default is 256 * 65536 on desktop. */
    maxPagedSplats?: number;
    /** Cap on simultaneously-rendered LOD splats. */
    lodSplatCount?: number;
    /** Skip auto-update; advance frames manually. Default true. */
    autoUpdate?: boolean;
    /** Custom env map hook (unused — kept here for forward compatibility). */
    [key: string]: unknown;
  }

  /**
   * SparkRenderer is a `THREE.Mesh` subclass. Add it to a scene; the host
   * renderer picks it up via onBeforeRender and runs the splat sort + draw.
   */
  export class SparkRenderer extends THREE.Mesh {
    constructor(options: SparkRendererOptions);
    readonly renderer: THREE.WebGLRenderer;
  }
}

declare module "https://sparkjs.dev/releases/spark/2.0.0/spark.module.js" {
  export * from "sparkjs-2";
}
