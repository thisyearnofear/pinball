/**
 * Design tokens — single source of truth for all visual values.
 *
 * Core Principles:
 * - DRY: Every color, spacing, radius, and font size comes from here.
 * - CLEAN: Tokens are pure data, no side effects.
 * - ORGANIZED: Grouped by semantic category.
 */

export const colors = {
  background: {
    primary: '#0a0a0f',
    surface: '#12121a',
    elevated: '#1a1a26',
    overlay: 'rgba(0, 0, 0, 0.8)',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    default: 'rgba(255, 255, 255, 0.12)',
    emphasis: 'rgba(255, 255, 255, 0.2)',
    focus: 'rgba(99, 102, 241, 0.5)',
  },
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.7)',
    muted: 'rgba(255, 255, 255, 0.5)',
    disabled: 'rgba(255, 255, 255, 0.3)',
  },
  accent: {
    primary: '#6366f1',
    primaryHover: '#818cf8',
    secondary: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  },
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
  fontFamilyDisplay: "'Orbitron', system-ui, sans-serif",
  fontFamilyArcade: "'Press Start 2P', monospace",
  size: {
    xs: 11,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 28,
    '4xl': 36,
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  glow: '0 0 20px rgba(99, 102, 241, 0.3)',
} as const;

export const transitions = {
  fast: '150ms ease',
  normal: '250ms ease',
  slow: '400ms ease',
} as const;

export const zIndex = {
  base: 1,
  overlay: 100,
  modal: 200,
  toast: 300,
} as const;

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;
