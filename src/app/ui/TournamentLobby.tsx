import React from 'react';
import { getAllTournaments, type TournamentMeta } from '@/config/tournaments';
import { getTournamentWorld } from '@/config/tournaments';

import { colors, spacing, typography, radius, shadows, transitions } from '@/theme/tokens';
import { useIsSmallScreen } from '@/hooks/use-media-query';
import { Button, Skeleton } from '@/app/ui';

type Props = {
  tournaments: TournamentMeta[];
  activeTournamentId: number | null;
  entered: boolean;
  isConnected: boolean;
  loading?: boolean;
  onSelectTournament: (id: number) => void;
  onEnterTournament: (id: number) => void;
  onStartTournament: (id: number) => void;
  onPractice: () => void;
};

const gridColumns = (isSmall: boolean) =>
  isSmall ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))';

export function TournamentLobby(props: Props) {
  const tournaments = props.tournaments.length > 0 ? props.tournaments : getAllTournaments();
  const isSmall = useIsSmallScreen();

  if (props.loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: spacing['3xl'] }}>
          <Skeleton width="60%" height={32} style={{ margin: '0 auto' }} />
          <Skeleton width="40%" height={16} style={{ margin: `${spacing.sm}px auto 0` }} />
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: gridColumns(isSmall),
          gap: spacing.lg,
          marginBottom: spacing['2xl'],
        }}>
          {Array.from({ length: isSmall ? 2 : 3 }).map((_, i) => (
            <div key={i} style={{
              background: colors.background.surface,
              borderRadius: radius.xl,
              border: `1px solid ${colors.border.subtle}`,
              overflow: 'hidden',
            }}>
              <Skeleton height={140} width="100%" style={{ borderRadius: 0 }} />
              <div style={{ padding: spacing.lg }}>
                <Skeleton width="70%" height={18} />
                <Skeleton width="100%" height={14} style={{ marginTop: spacing.xs }} />
                <Skeleton width="50%" height={12} style={{ marginTop: spacing.md }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: spacing['3xl'] }}>
        <h1 style={{
          margin: 0,
          fontSize: isSmall ? typography.size['2xl'] : typography.size['3xl'],
          fontWeight: typography.weight.bold,
          background: colors.accent.gradient,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Choose Your World
        </h1>
        <p style={{
          margin: `${spacing.sm}px 0 0`,
          fontSize: isSmall ? typography.size.sm : typography.size.md,
          color: colors.text.secondary,
        }}>
          Each tournament is a unique Marble world. Compete for MUSD prizes.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: gridColumns(isSmall),
        gap: isSmall ? spacing.md : spacing.lg,
        marginBottom: spacing['2xl'],
      }}>
        {tournaments.map(t => (
          <TournamentCard
            key={t.id}
            tournament={t}
            isActive={props.activeTournamentId === t.id}
            entered={props.activeTournamentId === t.id && props.entered}
            isConnected={props.isConnected}
            onSelect={() => props.onSelectTournament(t.id)}
            onEnter={() => props.onEnterTournament(t.id)}
            onStart={() => props.onStartTournament(t.id)}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <Button variant="secondary" size="lg" onClick={props.onPractice}>
          Practice Mode
        </Button>
      </div>
    </div>
  );
}

type CardProps = {
  tournament: TournamentMeta;
  isActive: boolean;
  entered: boolean;
  isConnected: boolean;
  onSelect: () => void;
  onEnter: () => void;
  onStart: () => void;
};

function TournamentCard(props: CardProps) {
  const world = getTournamentWorld(props.tournament.id);
  const gradient = world?.gradient || 'linear-gradient(135deg, #1a0a2e, #0f0f23)';
  const isSmall = useIsSmallScreen();
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onClick={props.onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: colors.background.surface,
        borderRadius: radius.xl,
        border: props.isActive
          ? '2px solid var(--world-primary, #6366f1)'
          : `1px solid ${colors.border.subtle}`,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: `all ${transitions.normal}`,
        transform: props.isActive ? 'scale(1.02)' : hovered ? 'scale(1.01)' : 'scale(1)',
        boxShadow: props.isActive ? 'var(--world-glow, 0 0 20px rgba(99, 102, 241, 0.3))' : 'none',
      }}
    >
      <div style={{
        height: isSmall ? 100 : 140,
        background: gradient,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {props.isActive && (
          <div style={{
            position: 'absolute',
            top: spacing.sm,
            right: spacing.sm,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: radius.full,
            background: colors.accent.primary,
            fontSize: typography.size.xs,
            fontWeight: typography.weight.semibold,
            color: colors.text.primary,
          }}>
            Active
          </div>
        )}
        <div style={{
          fontSize: isSmall ? 36 : 48,
          opacity: 0.3,
          filter: 'grayscale(0.5)',
        }}>
          {world?.name.charAt(0)}
        </div>
      </div>

      <div style={{ padding: spacing.lg }}>
        <div style={{
          fontSize: typography.size.lg,
          fontWeight: typography.weight.semibold,
          color: colors.text.primary,
          marginBottom: spacing.xs,
        }}>
          {props.tournament.name}
        </div>
        <div style={{
          fontSize: typography.size.sm,
          color: colors.text.muted,
          marginBottom: spacing.md,
        }}>
          {props.tournament.description}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: typography.size.xs,
          color: colors.text.muted,
          marginBottom: spacing.md,
        }}>
          <span>Entry: {props.tournament.entryFee || '10 MUSD'}</span>
          <span>Prize: {props.tournament.prizePool || '50 MUSD'}</span>
        </div>

        {props.isActive && props.entered ? (
          <Button fullWidth onClick={(e) => { e.stopPropagation(); props.onStart(); }}>
            Play Now
          </Button>
        ) : props.isActive && !props.entered ? (
          <Button
            fullWidth
            variant="secondary"
            disabled={!props.isConnected}
            onClick={(e) => { e.stopPropagation(); props.onEnter(); }}
          >
            {props.isConnected ? 'Enter Tournament' : 'Connect Wallet'}
          </Button>
        ) : (
          <div style={{
            width: '100%',
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderRadius: radius.md,
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${colors.border.subtle}`,
            color: colors.text.muted,
            fontSize: typography.size.sm,
            textAlign: 'center',
          }}>
            Select to play
          </div>
        )}
      </div>
    </div>
  );
}
