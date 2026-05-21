/**
 * Global styles — CSS variables from design tokens.
 *
 * Core Principles:
 * - DRY: Single source of truth injected as CSS custom properties.
 * - PERFORMANT: CSS variables are resolved at render time, no JS overhead.
 */

import { colors, spacing, radius, typography, shadows, transitions, zIndex } from './tokens';

export function injectGlobalStyles(): void {
  if (document.getElementById('pinball-global-styles')) return;

  const style = document.createElement('style');
  style.id = 'pinball-global-styles';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    :root {
      /* Colors */
      --bg-primary: ${colors.background.primary};
      --bg-surface: ${colors.background.surface};
      --bg-elevated: ${colors.background.elevated};
      --bg-overlay: ${colors.background.overlay};

      --border-subtle: ${colors.border.subtle};
      --border-default: ${colors.border.default};
      --border-emphasis: ${colors.border.emphasis};
      --border-focus: ${colors.border.focus};

      --text-primary: ${colors.text.primary};
      --text-secondary: ${colors.text.secondary};
      --text-muted: ${colors.text.muted};
      --text-disabled: ${colors.text.disabled};

      --accent-primary: ${colors.accent.primary};
      --accent-primary-hover: ${colors.accent.primaryHover};
      --accent-secondary: ${colors.accent.secondary};
      --accent-gradient: ${colors.accent.gradient};

      --status-success: ${colors.status.success};
      --status-warning: ${colors.status.warning};
      --status-error: ${colors.status.error};
      --status-info: ${colors.status.info};

      /* Spacing */
      --space-xs: ${spacing.xs}px;
      --space-sm: ${spacing.sm}px;
      --space-md: ${spacing.md}px;
      --space-lg: ${spacing.lg}px;
      --space-xl: ${spacing.xl}px;
      --space-2xl: ${spacing['2xl']}px;
      --space-3xl: ${spacing['3xl']}px;

      /* Radius */
      --radius-sm: ${radius.sm}px;
      --radius-md: ${radius.md}px;
      --radius-lg: ${radius.lg}px;
      --radius-xl: ${radius.xl}px;
      --radius-full: ${radius.full}px;

      /* Typography */
      --font-family: ${typography.fontFamily};
      --font-family-mono: ${typography.fontFamilyMono};
      --text-xs: ${typography.size.xs}px;
      --text-sm: ${typography.size.sm}px;
      --text-md: ${typography.size.md}px;
      --text-lg: ${typography.size.lg}px;
      --text-xl: ${typography.size.xl}px;
      --text-2xl: ${typography.size['2xl']}px;
      --text-3xl: ${typography.size['3xl']}px;
      --text-4xl: ${typography.size['4xl']}px;
      --font-normal: ${typography.weight.normal};
      --font-medium: ${typography.weight.medium};
      --font-semibold: ${typography.weight.semibold};
      --font-bold: ${typography.weight.bold};
      --leading-tight: ${typography.lineHeight.tight};
      --leading-normal: ${typography.lineHeight.normal};
      --leading-relaxed: ${typography.lineHeight.relaxed};

      /* Shadows */
      --shadow-sm: ${shadows.sm};
      --shadow-md: ${shadows.md};
      --shadow-lg: ${shadows.lg};
      --shadow-glow: ${shadows.glow};

      /* Transitions */
      --transition-fast: ${transitions.fast};
      --transition-normal: ${transitions.normal};
      --transition-slow: ${transitions.slow};

      /* Z-index */
      --z-base: ${zIndex.base};
      --z-overlay: ${zIndex.overlay};
      --z-modal: ${zIndex.modal};
      --z-toast: ${zIndex.toast};
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    html {
      font-family: var(--font-family);
      background: var(--bg-primary);
      color: var(--text-primary);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg-primary);
    }

    button {
      font-family: inherit;
      cursor: pointer;
      border: none;
      background: none;
      padding: 0;
      margin: 0;
    }

    button:focus-visible {
      outline: 2px solid var(--border-focus);
      outline-offset: 2px;
    }

    input, select {
      font-family: inherit;
    }

    ::selection {
      background: var(--accent-primary);
      color: var(--text-primary);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideUpMobile {
      from { opacity: 0; transform: translateY(100%); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes scoreFloat {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 1; transform: translate(-50%, -80%) scale(1.1); }
      100% { opacity: 0; transform: translate(-50%, -120%) scale(0.8); }
    }

    @keyframes flashFade {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }

    @keyframes screenShake {
      0%, 100% { transform: translate(0, 0); }
      20% { transform: translate(-3px, 2px); }
      40% { transform: translate(3px, -2px); }
      60% { transform: translate(-2px, -1px); }
      80% { transform: translate(2px, 1px); }
    }

    /* Responsive base */
    @media (max-width: 768px) {
      html { font-size: 14px; }
    }

    @media (max-width: 480px) {
      html { font-size: 13px; }
    }

    /* Accessibility: respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* Focus visible for keyboard navigation */
    :focus-visible {
      outline: 2px solid var(--border-focus);
      outline-offset: 2px;
    }

    /* Skip link for accessibility */
    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--accent-primary);
      color: var(--text-primary);
      padding: 8px 16px;
      z-index: 9999;
      transition: top 0.2s ease;
    }
    .skip-link:focus {
      top: 0;
    }
  `;

  document.head.appendChild(style);
}
