import { MarbleWorld } from '../../config/worlds';
import { WorldRenderer } from './renderer';

// SparkJS types - loaded dynamically via CDN in index.html
interface SparkEngine {
  loadSplat: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  dispose: () => void;
  getCamera: () => unknown;
  render: () => void;
}

export class SparkWorldRenderer implements WorldRenderer {
  private spark: SparkEngine | null = null;
  private container: HTMLDivElement | null = null;
  private scene: unknown = null;
  private loadedWorld: MarbleWorld | null = null;

  async initialize(container: HTMLDivElement): Promise<void> {
    this.container = container;
    
    // Wait for SparkJS to be available on window (loaded via CDN in index.html)
    if ((window as unknown as { Spark?: new (options: { container: HTMLElement; background?: boolean }) => SparkEngine }).Spark) {
      const Spark = (window as unknown as { Spark: new (options: { container: HTMLElement; background?: boolean }) => SparkEngine }).Spark;
      this.spark = new Spark({
        container,
        background: false,
      });
      
      console.log('SparkWorldRenderer initialized');
    } else {
      console.warn('SparkJS not loaded - world rendering disabled');
    }
  }

  async loadWorld(world: MarbleWorld): Promise<void> {
    if (!this.container || !this.spark) {
      console.warn('Renderer not initialized, skipping world load');
      return;
    }

    this.loadedWorld = world;
    const url = world.radUrl || world.spzUrl;
    
    await this.spark.loadSplat(url, {
      position: world.position,
      rotation: world.rotation,
      scale: world.scale,
    });
    
    console.log('Loaded world:', world.name, 'from', url);
  }

  updateCamera(camera: unknown): void {
    if (!this.spark) return;
    
    const sparkCamera = this.spark.getCamera();
    if (sparkCamera && camera) {
      // Sync camera state
    }
  }

  dispose(): void {
    if (this.spark) {
      this.spark.dispose();
    }
    this.spark = null;
    this.scene = null;
    this.container = null;
    this.loadedWorld = null;
  }
}