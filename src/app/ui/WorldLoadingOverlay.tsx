import { type MarbleWorld } from '@/config/worlds';
import { Button } from './Button';

import { colors, spacing, typography, radius, shadows } from '@/theme/tokens';

interface WorldLoadingOverlayProps {
  world: MarbleWorld;
  progress: number;
  onDismiss?: () => void;
}

export function WorldLoadingOverlay(props: WorldLoadingOverlayProps) {
  const isError = props.progress < 0;
  const progressPercent = Math.min(Math.abs(props.progress) * 100, 100);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.background.overlay,
        backdropFilter: 'blur(4px)',
        zIndex: 10,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{
        background: colors.background.elevated,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.xl,
        padding: `${spacing.xl}px ${spacing['2xl']}px`,
        maxWidth: 320,
        width: '90%',
        textAlign: 'center',
        boxShadow: shadows.lg,
      }}>
        <h3 style={{ margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
          {props.world.name}
        </h3>
        <p style={{ margin: `${spacing.sm}px 0 0`, fontSize: typography.size.md, color: colors.text.secondary }}>
          {isError ? 'Failed to load world' : 'Loading world...'}
        </p>

        {!isError && (
          <div style={{
            marginTop: spacing.lg,
            height: 6,
            background: colors.border.subtle,
            borderRadius: radius.full,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: colors.accent.gradient,
              borderRadius: radius.full,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}

        <div style={{
          marginTop: spacing.sm,
          fontSize: typography.size.sm,
          color: isError ? colors.status.error : colors.text.muted,
        }}>
          {isError
            ? 'Game will continue with fallback background'
            : `Loading Gaussian splat data... ${Math.round(progressPercent)}%`
          }
        </div>

        {isError && props.onDismiss && (
          <Button variant="secondary" onClick={props.onDismiss} style={{ marginTop: spacing.lg }}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

interface WorldLoadingIndicatorProps {
  progress: number;
  worldName: string;
}

export function WorldLoadingIndicator(props: WorldLoadingIndicatorProps) {
  const progressPercent = Math.min(Math.abs(props.progress) * 100, 100);
  const isError = props.progress < 0;

  if (isError || props.progress >= 1) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: spacing.md,
        right: spacing.md,
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: radius.md,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        zIndex: 5,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        border: `2px solid ${colors.border.emphasis}`,
        borderTopColor: colors.accent.primary,
        animation: 'spin 1s linear infinite',
      }} />
      <span style={{ fontSize: typography.size.xs, color: colors.text.secondary }}>
        {props.worldName} {Math.round(progressPercent)}%
      </span>
    </div>
  );
}
