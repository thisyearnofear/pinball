import React, { useMemo } from "react";
import { colors, radius } from "@/theme/tokens";

function hashAddress(addr: string): number[] {
  const hash: number[] = [];
  for (let i = 0; i < addr.length; i++) {
    hash.push(addr.charCodeAt(i));
  }
  return hash;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

type Props = {
  address: string;
  size?: number;
};

export function PlayerAvatar({ address, size = 40 }: Props) {
  const grid = useMemo(() => {
    const hash = hashAddress(address.toLowerCase());
    const seed = hash.reduce((a, b) => a + b, 0);
    const rng = seededRandom(seed);

    const gridSize = 5;
    const halfCols = Math.ceil(gridSize / 2);
    const grid: boolean[][] = [];

    for (let row = 0; row < gridSize; row++) {
      grid[row] = [];
      for (let col = 0; col < halfCols; col++) {
        const val = rng() > 0.4;
        grid[row][col] = val;
        grid[row][gridSize - 1 - col] = val;
      }
    }

    const hue = Math.floor(rng() * 360);
    const fillColor = `hsl(${hue}, 60%, 55%)`;

    return { grid, fillColor };
  }, [address]);

  const cellSize = size / 5;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        background: colors.background.elevated,
        border: `1px solid ${colors.border.subtle}`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {grid.grid.map((row, y) =>
          row.map((filled, x) =>
            filled ? (
              <rect
                key={`${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize}
                height={cellSize}
                fill={grid.fillColor}
                rx={1}
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}
