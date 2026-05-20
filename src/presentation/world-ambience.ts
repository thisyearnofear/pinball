/**
 * World ambience audio manager.
 *
 * Handles per-world ambient soundtracks with ducking under game FX.
 * Each world can have its own ambience track that plays during gameplay
 * and automatically ducks (lowers volume) when game events occur.
 */

export interface AmbienceConfig {
  url: string;
  volume: number;
  loop: boolean;
}

export class WorldAmbienceManager {
  private audio: HTMLAudioElement | null = null;
  private currentWorldId: string | null = null;
  private baseVolume = 0.3;
  private duckedVolume = 0.08;
  private isDucked = false;
  private duckTimeout: number | null = null;
  private disposed = false;

  /**
   * Set the base volume for ambience (0-1)
   */
  setBaseVolume(volume: number): void {
    this.baseVolume = Math.max(0, Math.min(1, volume));
    if (this.audio && !this.isDucked) {
      this.audio.volume = this.baseVolume;
    }
  }

  /**
   * Load and play ambience for a world
   */
  async loadWorld(worldId: string, url?: string): Promise<void> {
    if (this.disposed) return;

    if (this.currentWorldId === worldId && this.audio) {
      return;
    }

    this.stop();
    this.currentWorldId = worldId;

    if (!url) return;

    try {
      this.audio = new Audio(url);
      this.audio.loop = true;
      this.audio.volume = this.baseVolume;
      this.audio.preload = 'auto';

      await this.audio.play();
    } catch (e) {
      console.warn('Failed to load ambience for world:', worldId, e);
      this.audio = null;
    }
  }

  /**
   * Duck the ambience volume (e.g., during game FX)
   */
  duck(durationMs = 500): void {
    if (!this.audio || this.isDucked) return;

    this.isDucked = true;
    this.audio.volume = this.duckedVolume;

    if (this.duckTimeout) {
      clearTimeout(this.duckTimeout);
    }

    this.duckTimeout = window.setTimeout(() => {
      this.unduck();
    }, durationMs);
  }

  /**
   * Restore ambience volume
   */
  unduck(): void {
    if (!this.audio) return;

    this.isDucked = false;
    this.audio.volume = this.baseVolume;

    if (this.duckTimeout) {
      clearTimeout(this.duckTimeout);
      this.duckTimeout = null;
    }
  }

  /**
   * Pause ambience
   */
  pause(): void {
    if (this.audio) {
      this.audio.pause();
    }
  }

  /**
   * Resume ambience
   */
  resume(): void {
    if (this.audio && !this.disposed) {
      this.audio.play().catch(() => {});
    }
  }

  /**
   * Stop and clean up
   */
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.currentWorldId = null;
    this.isDucked = false;

    if (this.duckTimeout) {
      clearTimeout(this.duckTimeout);
      this.duckTimeout = null;
    }
  }

  /**
   * Dispose permanently
   */
  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  /**
   * Toggle mute
   */
  setMuted(muted: boolean): void {
    if (this.audio) {
      this.audio.muted = muted;
    }
  }
}
