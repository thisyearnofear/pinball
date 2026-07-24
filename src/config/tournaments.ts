/**
 * Tournament metadata - off-chain configuration for tournaments.
 *
 * Maps tournament IDs to their world theme and other metadata.
 * Entry fees and prize pools shown here are defaults; the contract
 * is the single source of truth for live values.
 */

import { MARBLE_WORLDS, type MarbleWorld, getWorldById } from './worlds';
import { getAppConfig } from './app-config';

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

/**
 * Get the payment token symbol for display (e.g. "MUSD", "NIM", "USDT").
 */
function tokenSymbol(): string {
  try {
    return getAppConfig().contracts.paymentToken.symbol;
  } catch {
    return "MUSD"; // safe default
  }
}

export const TOURNAMENT_META: Record<number, TournamentMeta> = {
  1: {
    id: 1,
    name: 'Pirate Ship',
    worldId: 'pirate-ship',
    description: 'Brave the depths of the sunken galleon.',
    entryFee: '1',  // symbol appended dynamically
    prizePool: 'Pot grows with each entry',
  },
  2: {
    id: 2,
    name: 'Spaceship',
    worldId: 'spaceship',
    description: 'Zero-gravity pinball aboard a cozy spaceship.',
    entryFee: '1',
    prizePool: 'Pot grows with each entry',
  },
  3: {
    id: 3,
    name: 'Hobbiton',
    worldId: 'hobbiton',
    description: 'Pinball in the Shire. Second breakfast included.',
    entryFee: '1',
    prizePool: 'Pot grows with each entry',
  },
  4: {
    id: 4,
    name: 'Haunted House',
    worldId: 'haunted-house',
    description: 'Spooky bumpers, spectral jackpots.',
    entryFee: '1',
    prizePool: 'Pot grows with each entry',
  },
};

export function getAllTournamentIds(): number[] {
  return Object.keys(TOURNAMENT_META).map(Number);
}

export function getAllTournaments(): TournamentMeta[] {
  const sym = tokenSymbol();
  return Object.values(TOURNAMENT_META).map(t => ({
    ...t,
    entryFee: t.entryFee ? `${t.entryFee} ${sym}` : undefined,
  }));
}