/**
 * World Reactor - responds to gameplay events with world-level reactions.
 * 
 * Triggers visual changes in the 3D world based on score milestones,
 * multiball events, and collision impacts.
 */

export type WorldReaction = {
  type: 'milestone' | 'multiball' | 'impact' | 'weather' | 'breathe';
  intensity: number;
  duration: number;
  data?: Record<string, unknown>;
};

export type MilestoneThreshold = {
  score: number;
  reaction: WorldReaction;
  triggered: boolean;
};

const DEFAULT_MILESTONES: MilestoneThreshold[] = [
  {
    score: 10000,
    reaction: { type: 'milestone', intensity: 0.3, duration: 3000, data: { effect: 'lights_flicker' } },
    triggered: false,
  },
  {
    score: 25000,
    reaction: { type: 'milestone', intensity: 0.5, duration: 5000, data: { effect: 'particles_appear' } },
    triggered: false,
  },
  {
    score: 50000,
    reaction: { type: 'weather', intensity: 0.7, duration: 8000, data: { effect: 'weather_shift' } },
    triggered: false,
  },
  {
    score: 100000,
    reaction: { type: 'breathe', intensity: 1.0, duration: 10000, data: { effect: 'world_breathe' } },
    triggered: false,
  },
];

export class WorldReactor {
  private milestones: MilestoneThreshold[];
  private currentScore = 0;
  private activeReactions: Map<string, { startTime: number; reaction: WorldReaction }> = new Map();
  private onReaction: ((reaction: WorldReaction) => void) | null = null;

  constructor(milestones?: MilestoneThreshold[]) {
    this.milestones = milestones ? milestones.map(m => ({ ...m })) : DEFAULT_MILESTONES.map(m => ({ ...m }));
  }

  /**
   * Set callback for when reactions trigger
   */
  setOnReaction(callback: (reaction: WorldReaction) => void): void {
    this.onReaction = callback;
  }

  /**
   * Update the reactor with current game state
   * Call this each frame from the game loop
   */
  update(score: number, isMultiball: boolean): void {
    this.currentScore = score;

    // Check milestones
    for (const milestone of this.milestones) {
      if (!milestone.triggered && score >= milestone.score) {
        milestone.triggered = true;
        this.triggerReaction(milestone.reaction);
      }
    }

    // Multiball reaction
    if (isMultiball) {
      const multiballReaction: WorldReaction = {
        type: 'multiball',
        intensity: 0.6,
        duration: 2000,
        data: { effect: 'world_pulse' },
      };
      this.triggerReaction(multiballReaction);
    }

    // Clean up expired reactions
    this.cleanupExpiredReactions();
  }

  /**
   * Trigger a ball impact reaction
   */
  triggerImpact(intensity: number = 0.4): void {
    const impactReaction: WorldReaction = {
      type: 'impact',
      intensity,
      duration: 500,
      data: { effect: 'impact_flash' },
    };
    this.triggerReaction(impactReaction);
  }

  /**
   * Reset all milestones (for new game)
   */
  reset(): void {
    this.currentScore = 0;
    this.activeReactions.clear();
    for (const milestone of this.milestones) {
      milestone.triggered = false;
    }
  }

  /**
   * Get current reaction intensity (0-1)
   */
  getCurrentIntensity(): number {
    if (this.activeReactions.size === 0) return 0;

    let maxIntensity = 0;
    const now = performance.now();

    for (const [, active] of this.activeReactions) {
      const elapsed = now - active.startTime;
      const progress = Math.min(elapsed / active.reaction.duration, 1);
      const fadeOut = 1 - progress;
      const intensity = active.reaction.intensity * fadeOut;
      maxIntensity = Math.max(maxIntensity, intensity);
    }

    return maxIntensity;
  }

  /**
   * Get active reaction types
   */
  getActiveReactionTypes(): string[] {
    return Array.from(this.activeReactions.values()).map(r => r.reaction.type);
  }

  private triggerReaction(reaction: WorldReaction): void {
    const key = `${reaction.type}-${performance.now()}`;
    this.activeReactions.set(key, {
      startTime: performance.now(),
      reaction,
    });

    this.onReaction?.(reaction);
  }

  private cleanupExpiredReactions(): void {
    const now = performance.now();

    for (const [key, active] of this.activeReactions) {
      if (now - active.startTime > active.reaction.duration) {
        this.activeReactions.delete(key);
      }
    }
  }
}
