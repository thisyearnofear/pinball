/**
 * Tournament metadata - off-chain configuration for tournaments.
 *
 * Maps tournament IDs to their world theme and other metadata.
 * Entry fees and prize pools shown here are defaults; the contract
 * is the single source of truth for live values.
 */

import { MARBLE_WORLDS, type MarbleWorld, getWorldById } from './worlds';
import { getAppConfig } from './app-config';

export type GameMode = "classic" | "kamikaze";

export interface TournamentMeta {
  id: number;
  name: string;
  worldId: string;
  /** kamikaze tournaments rank ascending (lowest drain time wins) */
  mode: GameMode;
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
    return "USDT"; // safe default
  }
}

export const TOURNAMENT_META: Record<number, TournamentMeta> = {
  1: {
    id: 1,
    name: 'Pirate Ship',
    worldId: 'pirate-ship',
    mode: 'kamikaze',
    description: 'Kamikaze Ball — drain fast, the galleon fights back.',
    entryFee: '1',  // symbol appended dynamically
    prizePool: 'Pot grows with each entry',
  },
  2: {
    id: 2,
    name: 'Spaceship',
    worldId: 'spaceship',
    mode: 'kamikaze',
    description: 'Kamikaze Ball in zero gravity. Fastest drain wins.',
    entryFee: '1',
    prizePool: 'Pot grows with each entry',
  },
  3: {
    id: 3,
    name: 'Hobbiton',
    worldId: 'hobbiton',
    mode: 'classic',
    description: 'Classic pinball in the Shire. Highest score wins.',
    entryFee: '1',
    prizePool: 'Pot grows with each entry',
  },
  4: {
    id: 4,
    name: 'Haunted House',
    worldId: 'haunted-house',
    mode: 'classic',
    description: 'Classic pinball. Spooky bumpers, spectral jackpots.',
    entryFee: '1',
    prizePool: 'Pot grows with each entry',
  },
};

/**
 * Whether a tournament ranks ascending (lower score = better).
 */
export function isInvertedTournament(id: number): boolean {
  return getTournamentMeta(id)?.mode === 'kamikaze';
}

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