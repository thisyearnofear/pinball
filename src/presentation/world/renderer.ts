import { MarbleWorld } from '../../config/worlds';

export interface WorldRenderer {
  initialize(container: HTMLDivElement): Promise<void>;
  loadWorld(world: MarbleWorld): Promise<void>;
  updateCamera(camera: any): void; // Using any for now to avoid dependency on specific camera types before Spark setup
  dispose(): void;
}
