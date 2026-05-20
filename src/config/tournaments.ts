/**
 * Tournament metadata - off-chain configuration for tournaments.
 *
 * Maps tournament IDs to their world theme and other metadata.
 * This allows themed tournaments without contract changes.
 */

import { MARBLE_WORLDS, type MarbleWorld, getWorldById } from './worlds';

export interface TournamentMeta {
  id: number;
  name: string;
  worldId: string;
  description?: string;
  posterUrl?: string;
  audioUrl?: string;
  entryFee?: string;
  prizePool?: string;
}

export function getTournamentMeta(id: number): TournamentMeta | null {
  return TOURNAMENT_META[id] || null;
}

export function getTournamentWorld(id: number): MarbleWorld | null {
  const meta = getTournamentMeta(id);
  if (!meta) return null;
  return getWorldById(meta.worldId) || null;
}

export const TOURNAMENT_META: Record<number, TournamentMeta> = {
  1: {
    id: 1,
    name: 'Pirate Ship',
    worldId: 'pirate-ship',
    description: 'Dive into the sunken pirate ship!',
    entryFee: '10 MUSD',
    prizePool: '50 MUSD',
  },
  2: {
    id: 2,
    name: 'Spaceship',
    worldId: 'spaceship',
    description: 'Explore the cozy spaceship.',
    entryFee: '10 MUSD',
    prizePool: '50 MUSD',
  },
  3: {
    id: 3,
    name: 'Hobbiton',
    worldId: 'hobbiton',
    description: 'Adventure in the Shire.',
    entryFee: '10 MUSD',
    prizePool: '50 MUSD',
  },
  4: {
    id: 4,
    name: 'Haunted House',
    worldId: 'haunted-house',
    description: 'Spooky adventures await.',
    entryFee: '10 MUSD',
    prizePool: '50 MUSD',
  },
};

export function getAllTournamentIds(): number[] {
  return Object.keys(TOURNAMENT_META).map(Number);
}

export function getAllTournaments(): TournamentMeta[] {
  return Object.values(TOURNAMENT_META);
}