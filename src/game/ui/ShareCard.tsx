import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getWorldById } from '@/config/worlds';
import { formatGameScore } from '@/utils/score-format';
import { buildShareText } from '@/utils/share-text';
import { buildChallengeUrl, type ChallengeInvite } from '@/utils/challenge-link';
import {
  renderShareCardImage,
  shareCardToBlob,
  shareCardToDataUrl,
} from '@/utils/share-card-image';
import { Button } from './index';

import { colors, spacing, typography, radius } from '@/theme/tokens';

interface ShareCardProps {
  score: number;
  worldId: string;
  tournamentName?: string;
  kamikaze?: boolean;
  aiDifficulty?: string;
  taunt?: string;
  playerName?: string;
  rankKanji?: string;
  rankName?: string;
  onDismiss: () => void;
  onShare?: () => void;
}

type ShareState = 'idle' | 'shared' | 'copied' | 'linkCopied' | 'error';

export function ShareCard(props: ShareCardProps) {
  const [state, setState] = useState<ShareState>('idle');
  const [imageUrl, setImageUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const world = getWorldById(props.worldId);
  const kamikaze = Boolean(props.kamikaze);
  const scoreText = formatGameScore(props.score, kamikaze);

  const shareText = useMemo(
    () =>
      buildShareText({
        kamikaze,
        scoreText,
        tournamentName: props.tournamentName,
        aiDifficulty: props.aiDifficulty,
        taunt: props.taunt,
        worldName: world?.name,
      }),
    [kamikaze, scoreText, props.tournamentName, props.aiDifficulty, props.taunt, world?.name],
  );

  const invite = useMemo<ChallengeInvite>(
    () => ({
      mode: kamikaze ? 'kamikaze' : 'classic',
      worldId: props.worldId,
      aiDifficulty: (['easy', 'medium', 'hard'].includes(props.aiDifficulty ?? '')
        ? props.aiDifficulty
        : 'medium') as ChallengeInvite['aiDifficulty'],
      score: props.score,
      ...(props.playerName?.trim() ? { name: props.playerName.trim() } : {}),
    }),
    [kamikaze, props.worldId, props.aiDifficulty, props.score, props.playerName],
  );

  useEffect(() => {
    let cancelled = false;
    try {
      const canvas = renderShareCardImage({
        kamikaze,
        scoreText,
        worldName: world?.name || props.worldId,
        worldGradient: world?.gradient,
        tournamentName: props.tournamentName,
        aiDifficulty: props.aiDifficulty,
        taunt: props.taunt,
        rankKanji: props.rankKanji,
        rankName: props.rankName,
        footerHost: window.location.host,
      });
      if (cancelled) return;
      canvasRef.current = canvas;
      setImageUrl(shareCardToDataUrl(canvas));
    } catch {
      // Canvas unavailable (older WebView): text share still works.
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kamikaze, scoreText, props.worldId, props.taunt, props.rankName]);

  function flash(next: ShareState) {
    setState(next);
    window.setTimeout(() => setState('idle'), 2000);
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function handleShare() {
    props.onShare?.();
    const url = buildChallengeUrl(invite);
    const canvas = canvasRef.current;

    // Richest path: native sheet with the image attached.
    if (canvas && typeof navigator.share === 'function') {
      const blob = await shareCardToBlob(canvas);
      if (blob) {
        const file = new File([blob], 'kamikaze-ball.png', { type: 'image/png' });
        try {
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: shareText, url });
            flash('shared');
            return;
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
        }
      }
      // Text + link via the native sheet.
      try {
        await navigator.share({ text: shareText, url });
        flash('shared');
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }

    // Fallback: clipboard.
    if (await copyText(`${shareText}\n${url}`)) flash('copied');
    else flash('error');
  }

  async function handleSaveImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await shareCardToBlob(canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kamikaze-ball-${props.score}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handleCopyLink() {
    if (await copyText(buildChallengeUrl(invite))) flash('linkCopied');
    else flash('error');
  }

  const shareLabel =
    state === 'shared' ? 'Shared!' : state === 'copied' ? 'Copied!' : state === 'error' ? 'Share failed' : 'Share…';

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
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Share card: ${scoreText}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        ) : (
          <div style={{
            height: 180,
            background: world?.gradient || 'linear-gradient(135deg, #1a0a2e, #0f0f23)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text.primary,
            fontSize: typography.size['4xl'],
            fontWeight: typography.weight.bold,
          }}>
            {scoreText}
          </div>
        )}

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <Button fullWidth onClick={handleShare}>
              {shareLabel}
            </Button>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Button variant="secondary" onClick={handleSaveImage} style={{ flex: 1 }} disabled={!imageUrl}>
                Save Image
              </Button>
              <Button variant="secondary" onClick={handleCopyLink} style={{ flex: 1 }}>
                {state === 'linkCopied' ? 'Link Copied!' : 'Copy Challenge Link'}
              </Button>
            </div>
            <div style={{ fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center' }}>
              Challenge links open a "beat this score" banner with one-tap rematch.
            </div>
            <Button variant="ghost" onClick={props.onDismiss} fullWidth>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
