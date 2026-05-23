import React from "react";
import styles from "./PinballHUD.module.scss";

type Props = {
  score: number;
  balls?: number;
  maxBalls?: number;
  tilt?: boolean;
  match?: number;
  credit?: number;
  compact?: boolean;
};

function LEDNumber({ value, digits = 7, color = "#ff3333" }: { value: number; digits?: number; color?: string }) {
  const formatted = String(value).padStart(digits, "0");

  return (
    <div
      className={`${styles.ledNumber} ${digits > 6 ? styles.ledLarge : styles.ledSmall}`}
      style={{ color, textShadow: `0 0 4px ${color}, 0 0 8px ${color}` }}
    >
      {formatted}
    </div>
  );
}

function BallIndicator({ active, color }: { active: boolean; color: string }) {
  return (
    <div
      className={styles.ballIndicator}
      style={active ? {
        background: color,
        boxShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
        borderColor: color,
      } : undefined}
    />
  );
}

export function PinballHUD({
  score,
  balls = 3,
  maxBalls = 3,
  tilt = false,
  match,
  credit,
  compact = false,
}: Props) {
  const ledColor = tilt ? "#ff4444" : "#ff6600";

  if (compact) {
    return (
      <div className={styles.compactContainer}>
        <LEDNumber value={score} digits={6} color={ledColor} />
        <div className={styles.compactSpacer} />
        <div className={styles.ballRow}>
          {Array.from({ length: maxBalls }).map((_, i) => (
            <BallIndicator key={i} active={i < balls} color={ledColor} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.fullContainer}>
      {/* Score display */}
      <div className={styles.scoreSection}>
        <div className={styles.scoreLabel}>
          Score
        </div>
        <LEDNumber value={score} digits={8} color={ledColor} />
      </div>

      {/* Ball indicators */}
      <div className={styles.ballRowCentered}>
        {Array.from({ length: maxBalls }).map((_, i) => (
          <BallIndicator key={i} active={i < balls} color={ledColor} />
        ))}
      </div>

      {/* Match and credits */}
      {(match !== undefined || credit !== undefined) && (
        <div className={styles.statsRow}>
          {match !== undefined && (
            <div className={styles.statCell}>
              <div className={styles.statLabel}>Match</div>
              <LEDNumber value={match} digits={2} color="#33ff33" />
            </div>
          )}
          {credit !== undefined && (
            <div className={styles.statCell}>
              <div className={styles.statLabel}>Credits</div>
              <LEDNumber value={credit} digits={2} color="#33ff33" />
            </div>
          )}
        </div>
      )}

      {/* Tilt warning */}
      {tilt && (
        <div className={styles.tiltWarning}>
          TILT
        </div>
      )}
    </div>
  );
}
