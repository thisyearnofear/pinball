import type { TablePhysics } from "@/definitions/game";

export interface WorldPalette {
  primary: string;
  hover: string;
  gradient: string;
  glow: string;
  muted: string;
}

export interface MarbleWorld {
  id: string;
  name: string;
  /** Gaussian-splat scene URL. Omit for a stylized 2D world (uses `gradient`). */
  spzUrl?: string;
  radUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  description?: string;
  camera?: CameraPresets;
  posterUrl?: string;
  ambienceUrl?: string;
  gradient: string;
  palette: WorldPalette;
  /**
   * A4 world-physics coupling: the world bends the table, so tournament
   * choice becomes ruleset choice. Applied deterministically from tickCount
   * (never wall clock) in the engine tick, so replays stay verifiable.
   * Omit for a still table. See docs/IMMERSION_SPEC.md (A4).
   */
  physics?: TablePhysics;
  /** One-line ruleset blurb surfaced on tournament cards (e.g. "rolling seas"). */
  physicsLabel?: string;
}

export interface CameraPresets {
  plunger: { position: [number, number, number]; target: [number, number, number] };
  overview: { position: [number, number, number]; target: [number, number, number] };
  drain: { position: [number, number, number]; target: [number, number, number] };
  side?: { position: [number, number, number]; target: [number, number, number] };
}

export const MARBLE_WORLDS: Record<string, MarbleWorld> = {
  HOBBITON: {
    id: 'hobbiton',
    name: 'Hobbiton',
    spzUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/hobbiton.spz',
    radUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/hobbiton-lod.rad',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    description: 'A cozy, detailed Hobbiton environment.',
    gradient: 'linear-gradient(135deg, #2d5016 0%, #4a7c23 30%, #8b6914 60%, #3d2b1f 100%)',
    palette: {
      primary: '#4a7c23',
      hover: '#6b9e35',
      gradient: 'linear-gradient(135deg, #4a7c23 0%, #8b6914 100%)',
      glow: '0 0 20px rgba(74, 124, 35, 0.4)',
      muted: 'rgba(74, 124, 35, 0.3)',
    },
    camera: {
      plunger: { position: [0, 2, 8], target: [0, 0, 0] },
      overview: { position: [0, 15, 15], target: [0, 0, 0] },
      drain: { position: [0, 1, 5], target: [0, -2, 0] },
    },
  },
  SPACESHIP: {
    id: 'spaceship',
    name: 'Cozy Spaceship',
    spzUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/cozy-spaceship_2.spz',
    radUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/cozy-spaceship_2-lod.rad',
    position: [0, 6.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    description: 'A futuristic cozy spaceship.',
    gradient: 'linear-gradient(135deg, #0a0e27 0%, #1a1a4e 30%, #2d1b69 60%, #0d0d2b 100%)',
    palette: {
      primary: '#6366f1',
      hover: '#818cf8',
      gradient: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
      glow: '0 0 20px rgba(99, 102, 241, 0.4)',
      muted: 'rgba(99, 102, 241, 0.3)',
    },
    camera: {
      plunger: { position: [0, 8, 10], target: [0, 6.5, 0] },
      overview: { position: [0, 25, 20], target: [0, 6.5, 0] },
      drain: { position: [0, 6, 8], target: [0, 4, 0] },
    },
    physics: { gravityScale: 0.92, sway: { amplitude: 0.02, periodTicks: 600 } },
    physicsLabel: 'low-g drift (floaty, slow roll)',
  },
  COTTAGE: {
    id: 'cottage',
    name: 'Cozy Cottage',
    spzUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/cozy_cottage.spz',
    radUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/cozy_cottage-lod.rad',
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    description: 'A quaint, cozy cottage.',
    gradient: 'linear-gradient(135deg, #3d2b1f 0%, #8b6914 30%, #5c4033 60%, #2d1f0e 100%)',
    palette: {
      primary: '#d97706',
      hover: '#f59e0b',
      gradient: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
      glow: '0 0 20px rgba(217, 119, 6, 0.4)',
      muted: 'rgba(217, 119, 6, 0.3)',
    },
    camera: {
      plunger: { position: [0, 3, 7], target: [0, 1, 0] },
      overview: { position: [0, 12, 12], target: [0, 1, 0] },
      drain: { position: [0, 2, 5], target: [0, 0, 0] },
    },
  },
  PIRATE_SHIP: {
    id: 'pirate-ship',
    name: 'Sunken Pirate Ship',
    spzUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/pirate_ship.spz',
    radUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/pirate_ship-lod.rad',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    description: 'A mysterious sunken pirate ship.',
    gradient: 'linear-gradient(135deg, #0a1628 0%, #1a3a5c 30%, #0d2137 60%, #051020 100%)',
    palette: {
      primary: '#0891b2',
      hover: '#06b6d4',
      gradient: 'linear-gradient(135deg, #0891b2 0%, #1e40af 100%)',
      glow: '0 0 20px rgba(8, 145, 178, 0.4)',
      muted: 'rgba(8, 145, 178, 0.3)',
    },
    camera: {
      plunger: { position: [0, 2, 10], target: [0, 0, 0] },
      overview: { position: [0, 18, 18], target: [0, 0, 0] },
      drain: { position: [0, 1, 6], target: [0, -3, 0] },
      side: { position: [12, 4, 0], target: [0, 0, 0] },
    },
    physics: { sway: { amplitude: 0.06, periodTicks: 240 } },
    physicsLabel: 'rolling seas (table sways ±2°)',
  },
  SAKURA_SHRINE: {
    id: 'sakura-shrine',
    name: 'Sakura Shrine',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    description: 'Vermilion torii gates beneath falling cherry blossoms. The divine wind carries the ball home.',
    gradient: 'linear-gradient(180deg, #2b1230 0%, #4a1e3a 45%, #6e2b3f 75%, #8a3b3a 100%)',
    palette: {
      primary: '#e34234',
      hover: '#f0544a',
      gradient: 'linear-gradient(135deg, #e34234 0%, #d4a017 100%)',
      glow: '0 0 20px rgba(227, 66, 52, 0.4)',
      muted: 'rgba(227, 66, 52, 0.3)',
    },
    camera: {
      plunger: { position: [0, 2, 8], target: [0, 0, 0] },
      overview: { position: [0, 15, 15], target: [0, 0, 0] },
      drain: { position: [0, 1, 5], target: [0, -2, 0] },
    },
  },
  HAUNTED_HOUSE: {
    id: 'haunted-house',
    name: 'Haunted House',
    spzUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/haunted-house.spz',
    radUrl: 'https://storage.googleapis.com/forge-dev-public/hackathon-260227/haunted-house-lod.rad',
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    description: 'A spooky haunted mansion.',
    gradient: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 30%, #4a1942 60%, #0d0515 100%)',
    palette: {
      primary: '#7c3aed',
      hover: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #dc2626 100%)',
      glow: '0 0 20px rgba(124, 58, 237, 0.4)',
      muted: 'rgba(124, 58, 237, 0.3)',
    },
    camera: {
      plunger: { position: [0, 3, 8], target: [0, 1, 0] },
      overview: { position: [0, 15, 15], target: [0, 1, 0] },
      drain: { position: [0, 2, 5], target: [0, -1, 0] },
    },
  },
};

export function getWorldById(id: string): MarbleWorld | undefined {
  return MARBLE_WORLDS[id.toUpperCase()] ||
    Object.values(MARBLE_WORLDS).find(w => w.id === id);
}

export function getAllWorlds(): MarbleWorld[] {
  return Object.values(MARBLE_WORLDS);
}
