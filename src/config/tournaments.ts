/**
 * Tournament metadata - off-chain configuration for tournaments.
 * 
 * Maps tournament IDs to their world theme and other metadata.
 * This allows themed tournaments without contract changes.
 */

import { MARBLE_WORLDS, type MarbleWorld } from './worlds';

export interface TournamentMeta {
  /** Tournament ID */
  id: number;
  /** Display name */
  name: string;
  /** World ID from MARBLE_WORLDS */
  worldId: string;
  /** Optional custom description */
  description?: string;
  /** Optional poster image URL (Marble keyframe video still) */
  posterUrl?: string;
  /** Optional ambience track URL */
  audioUrl?: string;
}

/**
 * Get tournament metadata by ID
 */
export function getTournamentMeta(id: number): TournamentMeta | null {
  return TOURNAMENT_META[id] || null;
}

/**
 * Get the world for a tournament
 */
export function getTournamentWorld(id: number): MarbleWorld | null {
  const meta = getTournamentMeta(id);
  if (!meta) return null;
  
  return MARBLE_WORLDS[meta.worldId.toUpperCase()] || 
         Object.values(MARBLE_WORLDS).find(w => w.id === meta.worldId) ||
         null;
}

/**
 * Tournament metadata registry.
 * 
 * Add new tournaments here to theme them.
 * The worldId maps to entries in worlds.ts.
 */
export const TOURNAMENT_META: Record<number, TournamentMeta> = {
  1: {
    id: 1,
    name: 'Pirate Ship',
    worldId: 'pirate-ship',
    description: 'Dive into the sunken pirate ship!',
  },
  2: {
    id: 2,
    name: 'Spaceship',
    worldId: 'spaceship',
    description: 'Explore the cozy spaceship.',
  },
  3: {
    id: 3,
    name: 'Hobbiton',
    worldId: 'hobbiton',
    description: 'Adventure in the Shire.',
  },
  4: {
    id: 4,
    name: 'Haunted House',
    worldId: 'haunted-house',
    description: 'Spooky adventures await.',
  },
};

/**
 * Get all tournament IDs
 */
export function getAllTournamentIds(): number[] {
  return Object.keys(TOURNAMENT_META).map(Number);
}