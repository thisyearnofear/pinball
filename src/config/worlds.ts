export interface MarbleWorld {
  id: string;
  name: string;
  spzUrl: string; // The .spz format is optimized for web rendering
  radUrl?: string; // Optional for massive, world-scale scenes (LOD)
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  description?: string;
  camera?: CameraPresets;
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
    camera: {
      plunger: { position: [0, 8, 10], target: [0, 6.5, 0] },
      overview: { position: [0, 25, 20], target: [0, 6.5, 0] },
      drain: { position: [0, 6, 8], target: [0, 4, 0] },
    },
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
    camera: {
      plunger: { position: [0, 2, 10], target: [0, 0, 0] },
      overview: { position: [0, 18, 18], target: [0, 0, 0] },
      drain: { position: [0, 1, 6], target: [0, -3, 0] },
      side: { position: [12, 4, 0], target: [0, 0, 0] },
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
    camera: {
      plunger: { position: [0, 3, 8], target: [0, 1, 0] },
      overview: { position: [0, 15, 15], target: [0, 1, 0] },
      drain: { position: [0, 2, 5], target: [0, -1, 0] },
    },
  },
};
