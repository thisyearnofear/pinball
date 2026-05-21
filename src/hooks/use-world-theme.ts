import { useEffect, useMemo } from "react";
import { getWorldById, type MarbleWorld } from "@/config/worlds";
import { colors, shadows } from "@/theme/tokens";

type ThemeVars = {
  "--world-primary": string;
  "--world-hover": string;
  "--world-gradient": string;
  "--world-glow": string;
  "--world-muted": string;
};

const defaultVars: ThemeVars = {
  "--world-primary": colors.accent.primary,
  "--world-hover": colors.accent.primaryHover,
  "--world-gradient": colors.accent.gradient,
  "--world-glow": shadows.glow,
  "--world-muted": "rgba(99, 102, 241, 0.3)",
};

function paletteToVars(palette: MarbleWorld["palette"]): ThemeVars {
  return {
    "--world-primary": palette.primary,
    "--world-hover": palette.hover,
    "--world-gradient": palette.gradient,
    "--world-glow": palette.glow,
    "--world-muted": palette.muted,
  };
}

export function useWorldTheme(worldId: string | null): MarbleWorld | null {
  const world = useMemo(() => (worldId ? getWorldById(worldId) ?? null : null), [worldId]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = world ? paletteToVars(world.palette) : defaultVars;

    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    return () => {
      for (const key of Object.keys(vars)) {
        root.style.removeProperty(key);
      }
    };
  }, [world]);

  return world;
}

export function getWorldAccent(worldId: string | null) {
  const world = worldId ? getWorldById(worldId) : null;
  if (!world) return {
    primary: colors.accent.primary,
    primaryHover: colors.accent.primaryHover,
    gradient: colors.accent.gradient,
    glow: shadows.glow,
    muted: 'rgba(99, 102, 241, 0.3)',
  };
  return {
    primary: world.palette.primary,
    primaryHover: world.palette.hover,
    gradient: world.palette.gradient,
    glow: world.palette.glow,
    muted: world.palette.muted,
  };
}
