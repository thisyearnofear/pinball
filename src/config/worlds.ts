export interface MarbleWorld {
  id: string;
  name: string;
  spzUrl: string; // The .spz format is optimized for web rendering
  radUrl?: string; // Optional for massive, world-scale scenes (LOD)
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  description?: string;
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
  },
};
