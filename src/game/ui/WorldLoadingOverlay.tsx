import { type MarbleWorld } from '@/config/worlds';
import { Button } from './Button';
import styles from './WorldLoadingOverlay.module.scss';

interface WorldLoadingOverlayProps {
  world: MarbleWorld;
  progress: number;
  onDismiss?: () => void;
}

export function WorldLoadingOverlay(props: WorldLoadingOverlayProps) {
  const isError = props.progress < 0;
  const progressPercent = Math.min(Math.abs(props.progress) * 100, 100);

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.panel}>
        <h3 className={styles.heading}>
          {props.world.name}
        </h3>
        <p className={styles.subtext}>
          {isError ? 'Failed to load world' : 'Loading world...'}
        </p>

        {!isError && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        )}

        <div className={`${styles.statusText} ${isError ? styles.statusError : styles.statusNormal}`}>
          {isError
            ? 'Game will continue with fallback background'
            : `Loading Gaussian splat data... ${Math.round(progressPercent)}%`
          }
        </div>

        {isError && props.onDismiss && (
          <Button variant="secondary" onClick={props.onDismiss} className={styles.dismissBtn}>
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
    <div className={styles.indicator} role="status" aria-live="polite">
      <div className={styles.spinner} />
      <span className={styles.indicatorLabel}>
        {props.worldName} {Math.round(progressPercent)}%
      </span>
    </div>
  );
}
