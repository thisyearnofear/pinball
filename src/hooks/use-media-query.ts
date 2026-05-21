import { useState, useEffect, useMemo } from "react";
import { breakpoints } from "@/theme/tokens";

type Breakpoint = keyof typeof breakpoints;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function useBreakpoint(bp: Breakpoint): boolean {
  const query = useMemo(() => `(min-width: ${breakpoints[bp]}px)`, [bp]);
  return useMediaQuery(query);
}

export function useIsMobile(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

export function useIsSmallScreen(): boolean {
  return !useBreakpoint("md");
}
