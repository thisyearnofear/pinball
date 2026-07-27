import React, { useState } from 'react';
import { getWorldById } from '@/config/worlds';
import { formatGameScore } from '@/utils/score-format';
import { Button, Card } from './index';

import { colors, spacing, typography, radius } from '@/theme/tokens';

interface ShareCardProps {
  score: number;
  worldId: string;
  tournamentName?: string;
  kamikaze?: boolean;
  aiDifficulty?: string;
  taunt?: string;
  onDismiss: () => void;
  onShare?: () => void;
}

export function ShareCard(props: ShareCardProps) {
  const [copied, setCopied] = useState(false);
  const world = getWorldById(props.worldId);
  const gradient = world?.gradient || 'linear-gradient(135deg, #1a0a2e, #0f0f23)';
  const kamikaze = Boolean(props.kamikaze);
  const scoreLabel = kamikaze ? 'Drain time' : 'Score';
  const scoreText = formatGameScore(props.score, kamikaze);

  function handleCopy() {
    const text = kamikaze
      ? `Kamikaze Ball\n` +
        `${props.tournamentName ? `Tournament: ${props.tournamentName}\n` : ''}` +
        `Drained the ball in ${scoreText}${props.aiDifficulty ? ` on ${props.aiDifficulty}` : ''}.\n` +
        `${props.taunt ? `The machine said: "${props.taunt}"\n` : ''}` +
        `\nThink you can drain it faster? Play now!`
      : `Kamikaze Ball\n` +
        `${props.tournamentName ? `Tournament: ${props.tournamentName}\n` : ''}` +
        `Score: ${scoreText}\n` +
        `World: ${world?.name || props.worldId}\n` +
        `\nPlay now!`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: colors.background.overlay,
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      zIndex: 950,
    }}>
      <div style={{
        width: 'min(400px, 100%)',
        borderRadius: radius.xl,
        overflow: 'hidden',
        background: colors.background.surface,
        border: `1px solid ${colors.border.default}`,
      }}>
        <div style={{
          height: 180,
          background: gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)',
          }} />
          <div style={{ position: 'relative', textAlign: 'center', color: colors.text.primary }}>
            <div style={{ fontSize: typography.size.sm, opacity: 0.8, marginBottom: spacing.xs }}>
              {props.tournamentName || 'Practice'}
            </div>
            <div style={{ fontSize: typography.size['4xl'], fontWeight: typography.weight.bold }}>
              {scoreText}
            </div>
            {kamikaze && (
              <div style={{ fontSize: typography.size.sm, opacity: 0.85, marginTop: spacing.xs }}>
                Kamikaze · {props.aiDifficulty ? `machine on ${props.aiDifficulty}` : 'vs the machine'}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: spacing.xl }}>
          {kamikaze && props.taunt && (
            <div style={{
              marginBottom: spacing.lg,
              padding: spacing.md,
              borderRadius: radius.md,
              border: `1px solid rgba(255, 68, 68, 0.4)`,
              background: 'rgba(255, 68, 68, 0.08)',
              textAlign: 'center',
              fontSize: typography.size.sm,
              color: colors.text.secondary,
            }}>
              The machine said: <strong style={{ color: '#ff4444' }}>"{props.taunt}"</strong>
            </div>
          )}
          <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>World</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
                  {world?.name || props.worldId}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>{scoreLabel}</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
                  {scoreText}
                </div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Button
              variant={copied ? "primary" : "secondary"}
              onClick={handleCopy}
              style={{ flex: 1 }}
            >
              {copied ? 'Copied!' : 'Copy Score'}
            </Button>
            <Button onClick={props.onDismiss} style={{ flex: 1 }}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
