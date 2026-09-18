/**
 * World host — owns the Three.js + Spark renderer lifecycle for Marble worlds.
 *
 * Spark 2.0 is a real renderer primitive, not the bootstrap-friendly wrapper
 * the previous version assumed. The flow is:
 *
 *   1. Append a `<canvas>` into the caller's container.
 *   2. Create a Three.js `WebGLRenderer` on that canvas.
 *   3. Build a Three.js `Scene` + `PerspectiveCamera`.
 *   4. Add a `SparkRenderer` (a `THREE.Mesh`) to the scene. It hooks the
 *      renderer's `onBeforeRender` to sort + draw the splats.
 *   5. Add a `SplatMesh` per world (`{ paged: true, url }` for `.rad`, plain
 *      `{ url }` for `.spz`). SplatMesh loads + decodes via an internal worker.
 *   6. Render loop: `renderer.render(scene, camera)` — SparkRenderer's hook
 *      handles the splat pass for free.
 *
 * Spark is bundled locally from `src/spark/spark.module.js` so it resolves
 * `import * as THREE from "three"` against the same THREE instance our app
 * uses.  See src/types/spark.d.ts for the declarations we touch.
 */

import * as THREE from "three";

import { type MarbleWorld } from "@/config/worlds";
import { type QualityTier, getQualityConfig, FPSMonitor } from "./quality";
import { getOptimalSplatUrl } from "./splat-loader";
import { CameraRig, type CameraPreset } from "./camera-rig";
import { PostProcessingManager, getPostProcessingConfig } from "./post-processing";
import { WorldReactor, type WorldReaction } from "./world-reactor";
import { WorldParticles } from "./world-particles";
import { BallLight } from "./ball-light";

import * as sparkModule from "../spark/spark.module.js";
import type {
  SparkRenderer as SparkRendererType,
  SplatMesh as SplatMeshType,
} from "sparkjs-2";

/** Subset of Spark exports we use. */
type SparkModule = {
  SparkRenderer: typeof SparkRendererType;
  SplatMesh: typeof SplatMeshType;
};

const spark = sparkModule as unknown as SparkModule;

/**
 * WorldHost manages the lifecycle of a Marble world scene.
 */
export class WorldHost {
  private sparkRenderer: SparkRendererType | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private currentWorld: MarbleWorld | null = null;
  private currentSplatMesh: SplatMeshType | null = null;
  private qualityTier: QualityTier = "high";
  private initialized = false;
  private onProgress: ((progress: number) => void) | null = null;
  private cameraRig: CameraRig | null = null;
  private rafId: number | null = null;
  private postProcessing: PostProcessingManager | null = null;
  private loadError: Error | null = null;
  private fpsMonitor: FPSMonitor | null = null;
  private onQualityChange: ((tier: QualityTier) => void) | null = null;
  private worldReactor: WorldReactor | null = null;
  private onWorldReaction: ((reaction: WorldReaction) => void) | null = null;
  private particles: WorldParticles | null = null;
  private ballLight: BallLight | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Initialize the world host with a container and initial world.
   */
  async initialize(config: WorldHostConfig): Promise<void> {
    this.container = config.container;
    this.currentWorld = config.world;
    this.qualityTier = config.qualityTier;
    this.onProgress = config.onProgress ?? null;
    this.onQualityChange = config.onQualityChange ?? null;

    const quality = getQualityConfig(this.qualityTier);

    // Build the canvas inside the container. Position:absolute / inset:0 so
    // it fills whatever the caller laid out. pointer-events:none so the 2D
    // pinball canvas (sibling at higher z-index) keeps receiving input.
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;";
    this.canvas = canvas;
    this.container.appendChild(canvas);

    const { width, height } = measureContainer(this.container);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // splats don't benefit from MSAA and it's expensive on mobile
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0); // transparent so the world's CSS gradient can peek through on first paint
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.threeRenderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera = camera;

    // SparkRenderer extends THREE.Mesh. It hooks renderer.onBeforeRender to
    // sort + draw the splats, so we just add it to the scene and call
    // `renderer.render(scene, camera)` like normal.
    const sparkRenderer = new spark.SparkRenderer({
      renderer,
      // Lower tier caps how many paged splats Spark keeps resident; lower-end
      // devices get fewer concurrent chunks and rely on LOD swap-in.
      maxPagedSplats: this.qualityTier === "high"
        ? 256 * 65536
        : this.qualityTier === "medium"
          ? 128 * 65536
          : 64 * 65536,
    });
    scene.add(sparkRenderer);
    this.sparkRenderer = sparkRenderer;

    // Keep the renderer sized to its container. The pinball UI re-lays-out
    // on viewport changes and the 3D backdrop must follow.
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Camera rig — owns the PerspectiveCamera's position + lookAt so the
    // existing camera-rig flyTo/preset/ball-tracking logic keeps working.
    this.cameraRig = new CameraRig();
    this.cameraRig.initialize(config.world);
    this.cameraRig.setSparkCamera(camera);

    // CSS post-processing overlay (vignette / color grading). Spark doesn't
    // expose a JS post-fx pipeline yet, so we lean on the existing CSS layer.
    this.postProcessing = new PostProcessingManager();
    this.postProcessing.initialize(this.container);
    this.postProcessing.setConfig(getPostProcessingConfig(this.qualityTier));

    this.fpsMonitor = new FPSMonitor();

    this.worldReactor = new WorldReactor();
    this.worldReactor.setOnReaction((reaction) => {
      this.onWorldReaction?.(reaction);
    });

    this.particles = new WorldParticles();
    this.particles.initialize(this.container);

    this.ballLight = new BallLight();
    this.ballLight.initialize(this.container);

    this.initialized = true;
    this.startRenderLoop();

    console.log("WorldHost initialized with quality tier:", this.qualityTier, "maxFPS:", quality.maxFPS);

    // Load the initial world.
    await this.loadWorld(config.world);
  }

  /**
   * Load a Marble world.
   */
  async loadWorld(world: MarbleWorld): Promise<void> {
    if (!this.initialized) {
      console.warn("WorldHost not initialized, skipping world load");
      return;
    }

    this.currentWorld = world;
    const url = getOptimalSplatUrl(world, this.qualityTier);
    if (!url) {
      const err = new Error(`World ${world.id} has no splat URL`);
      this.loadError = err;
      console.warn(err.message);
      this.onProgress?.(-1);
      return;
    }

    this.onProgress?.(0.05);

    // Tear down any prior splat before swapping in a new one.
    if (this.currentSplatMesh && this.scene) {
      this.scene.remove(this.currentSplatMesh);
      try {
        this.currentSplatMesh.dispose();
      } catch (e) {
        console.warn("Error disposing previous SplatMesh:", e);
      }
      this.currentSplatMesh = null;
    }

    const isRad = /\.rad(\?|$)/i.test(url);
    const mesh = new spark.SplatMesh({
      url,
      // For .rad we need the paged stream; .spz loads as a single buffer.
      paged: isRad || undefined,
    });

    // Apply the world transform (position / rotation / scale per the config).
    mesh.position.set(world.position[0], world.position[1], world.position[2]);
    mesh.rotation.set(world.rotation[0], world.rotation[1], world.rotation[2]);
    mesh.scale.set(world.scale[0], world.scale[1], world.scale[2]);

    this.scene!.add(mesh);
    this.currentSplatMesh = mesh;

    // SplatMesh.initialized is a Promise that resolves once the loader worker
    // has finished decoding. Until then, SparkRenderer draws nothing for it.
    try {
      await mesh.initialized;
      this.loadError = null;
      this.onProgress?.(1);
      console.log("Loaded world:", world.name, "from", url);
    } catch (e) {
      this.loadError = e instanceof Error ? e : new Error(String(e));
      console.error("Failed to load world:", world.name, this.loadError);
      this.onProgress?.(-1);
    }
  }

  /**
   * Get load error if world failed to load.
   */
  getLoadError(): Error | null {
    return this.loadError;
  }

  /**
   * Load a world by its ID (looks up from MARBLE_WORLDS config).
   */
  async loadWorldById(worldId: string): Promise<MarbleWorld | null> {
    const { MARBLE_WORLDS } = await import("@/config/worlds");
    const world =
      MARBLE_WORLDS[worldId.toUpperCase()] ||
      Object.values(MARBLE_WORLDS).find((w) => w.id === worldId);
    if (world) {
      await this.loadWorld(world);
      return world;
    }
    console.warn("World not found:", worldId);
    return null;
  }

  /**
   * Update the host configuration.
   *
   * Note: real SparkRenderer has no `setQuality` knob at runtime; quality is
   * pinned at construction (maxPagedSplats, etc). We accept the request but
   * only persist the new tier — the FPS monitor in the render loop still
   * downgrades based on measured frame rate. Splat LOD and page budgets are
   * tuned at construction time.
   */
  updateConfig(config: Partial<WorldHostConfig>): void {
    if (config.qualityTier) {
      this.qualityTier = config.qualityTier;
    }
    if (config.world) {
      this.loadWorld(config.world);
    }
  }

  /**
   * Dispose of all GPU + DOM resources.
   */
  dispose(): void {
    this.stopRenderLoop();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.currentSplatMesh && this.scene) {
      this.scene.remove(this.currentSplatMesh);
      try {
        this.currentSplatMesh.dispose();
      } catch {
        // already disposed
      }
      this.currentSplatMesh = null;
    }

    if (this.sparkRenderer && this.scene) {
      this.scene.remove(this.sparkRenderer);
    }
    // SparkRenderer's GL resources are owned by the host WebGLRenderer — its
    // dispose() tears them down. No dedicated dispose() needed on SparkRenderer.
    this.sparkRenderer = null;

    if (this.threeRenderer) {
      this.threeRenderer.dispose();
      this.threeRenderer.forceContextLoss?.();
      this.threeRenderer = null;
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;

    this.scene = null;
    this.camera = null;

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
    this.worldReactor = null;
    this.onWorldReaction = null;
    if (this.particles) {
      this.particles.dispose();
      this.particles = null;
    }
    if (this.ballLight) {
      this.ballLight.dispose();
      this.ballLight = null;
    }

    this.container = null;
    this.currentWorld = null;
    this.initialized = false;
  }

  /**
   * Get the current world.
   */
  getCurrentWorld(): MarbleWorld | null {
    return this.currentWorld;
  }

  /**
   * Check if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Fly camera to a preset position (cinematic transition).
   */
  flyToPreset(preset: CameraPreset, options?: { duration?: number; onComplete?: () => void }): void {
    this.cameraRig?.setPreset(preset, options);
  }

  /**
   * Fly camera to specific position/target.
   */
  flyTo(
    position: [number, number, number],
    target: [number, number, number],
    options?: { duration?: number; onComplete?: () => void },
  ): void {
    this.cameraRig?.flyTo(position, target, options);
  }

  /**
   * Enable/disable ball-following camera mode.
   */
  setBallTracking(enabled: boolean): void {
    this.cameraRig?.setBallTracking(enabled);
  }

  /**
   * Update ball position for camera tracking.
   */
  updateBallPosition(gameX: number, gameY: number): void {
    this.cameraRig?.updateBallPosition(gameX, gameY);
  }

  /**
   * Pause ball tracking (e.g., during cinematic transitions).
   */
  pauseBallTracking(paused: boolean): void {
    this.cameraRig?.pauseBallTracking(paused);
  }

  /**
   * Update world reactor with game state.
   */
  updateReactor(score: number, isMultiball: boolean): void {
    this.worldReactor?.update(score, isMultiball);
  }

  /**
   * Get current reaction intensity (0-1).
   */
  getReactionIntensity(): number {
    return this.worldReactor?.getCurrentIntensity() ?? 0;
  }

  /**
   * Trigger impact reaction.
   */
  triggerImpact(intensity?: number): void {
    this.worldReactor?.triggerImpact(intensity);
  }

  /**
   * Reset reactor for new game.
   */
  resetReactor(): void {
    this.worldReactor?.reset();
  }

  /**
   * Set reaction callback.
   */
  setOnWorldReaction(callback: (reaction: WorldReaction) => void): void {
    this.onWorldReaction = callback;
  }

  /**
   * Update ball light position.
   */
  updateBallLight(gameX: number, gameY: number, velocity: number): void {
    this.ballLight?.updatePosition(gameX, gameY, velocity);
  }

  /**
   * Spawn particles at world position.
   */
  spawnParticles(worldX: number, worldY: number, worldZ: number, config?: Record<string, unknown>): void {
    this.particles?.spawnBurst(worldX, worldY, worldZ, config as never);
  }

  /**
   * Spawn bumper impact particles.
   */
  spawnBumperParticles(worldX: number, worldY: number, worldZ: number, color: string): void {
    this.particles?.spawnBumperImpact(worldX, worldY, worldZ, color);
  }

  /**
   * Start the render loop. SparkRenderer hooks renderer.onBeforeRender so a
   * single `renderer.render(scene, camera)` per frame is all we need — no
   * separate "spark.render()" call exists in the real API.
   */
  private startRenderLoop(): void {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );

    const loop = () => {
      this.fpsMonitor?.tick();
      this.cameraRig?.update();
      if (this.threeRenderer && this.scene && this.camera) {
        this.threeRenderer.render(this.scene, this.camera);
      }

      // Adaptive degrade. SparkRenderer has no runtime setQuality; the FPS
      // monitor still records so future mounts can pick a better tier, and
      // we notify listeners so the UI can adjust non-3D fx budgets.
      if (this.fpsMonitor) {
        const newTier = this.fpsMonitor.getDegradeTier(this.qualityTier);
        if (newTier && newTier !== this.qualityTier) {
          this.qualityTier = newTier;
          this.postProcessing?.setConfig(getPostProcessingConfig(this.qualityTier));
          this.fpsMonitor.reset();
          console.log("Quality degraded to:", this.qualityTier);
          this.onQualityChange?.(this.qualityTier);
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);

    if (isMobile) {
      // Land on the overview shot on mobile so the first frame isn't a
      // close-up of the plunger area. WorldHost calls this directly so the
      // rig has a moment to construct its first frame.
      setTimeout(() => {
        this.cameraRig?.setPreset("overview", { duration: 0 });
      }, 100);
    }
  }

  /**
   * Stop the render loop.
   */
  private stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Resize the WebGL renderer to match the container's current box.
   */
  private handleResize(): void {
    if (!this.container || !this.threeRenderer || !this.camera) return;
    const { width, height } = measureContainer(this.container);
    if (width <= 0 || height <= 0) return;
    this.threeRenderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Measure a container's current box, falling back to the parent element when
 * the container has no size yet (e.g. mid-mount).
 */
function measureContainer(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  const parent = el.parentElement;
  if (parent) {
    const p = parent.getBoundingClientRect();
    return { width: p.width, height: p.height };
  }
  return { width: 1, height: 1 };
}

interface WorldHostConfig {
  container: HTMLDivElement;
  world: MarbleWorld;
  qualityTier: QualityTier;
  onProgress?: (progress: number) => void;
  onQualityChange?: (tier: QualityTier) => void;
}
