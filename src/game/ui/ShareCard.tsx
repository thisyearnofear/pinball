import React, { useState } from 'react';
import { getWorldById } from '@/config/worlds';
import { Button, Card } from './index';

import { colors, spacing, typography, radius } from '@/theme/tokens';

interface ShareCardProps {
  score: number;
  worldId: string;
  tournamentName?: string;
  onDismiss: () => void;
  onShare?: () => void;
}

export function ShareCard(props: ShareCardProps) {
  const [copied, setCopied] = useState(false);
  const world = getWorldById(props.worldId);
  const gradient = world?.gradient || 'linear-gradient(135deg, #1a0a2e, #0f0f23)';

  function handleCopy() {
    const text = `Kamikaze Ball\n` +
      `${props.tournamentName ? `Tournament: ${props.tournamentName}\n` : ''}` +
      `Score: ${props.score.toLocaleString()}\n` +
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
              {props.score.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ padding: spacing.xl }}>
          <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>World</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
                  {world?.name || props.worldId}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>Score</div>
                <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
                  {props.score.toLocaleString()}
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
