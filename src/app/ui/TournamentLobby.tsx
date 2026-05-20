import React from 'react';
import { getAllTournaments, type TournamentMeta } from '@/config/tournaments';
import { getTournamentWorld } from '@/config/tournaments';

type Props = {
  tournaments: TournamentMeta[];
  activeTournamentId: number | null;
  entered: boolean;
  isConnected: boolean;
  onSelectTournament: (id: number) => void;
  onEnterTournament: (id: number) => void;
  onStartTournament: (id: number) => void;
  onPractice: () => void;
};

export function TournamentLobby(props: Props) {
  const tournaments = props.tournaments.length > 0 ? props.tournaments : getAllTournaments();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      zIndex: 900,
      overflow: 'auto',
    }}>
      <div style={{
        width: 'min(900px, 100%)',
        maxWidth: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Mezo Pinball Arcade
          </h1>
          <p style={{
            margin: '8px 0 0',
            fontSize: 14,
            color: 'rgba(255,255,255,0.6)',
          }}>
            Choose a world. Enter the tournament. Win MUSD.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: 24,
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
          <button
            onClick={props.onPractice}
            style={{
              padding: '12px 32px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            }}
          >
            Practice Mode
          </button>
        </div>
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

  return (
    <div
      onClick={props.onSelect}
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        border: props.isActive
          ? '2px solid #6366f1'
          : '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: props.isActive ? 'scale(1.02)' : 'scale(1)',
      }}
      onMouseEnter={e => {
        if (!props.isActive) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          e.currentTarget.style.transform = 'scale(1.01)';
        }
      }}
      onMouseLeave={e => {
        if (!props.isActive) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      <div style={{
        height: 140,
        background: gradient,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {props.isActive && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 10px',
            borderRadius: 20,
            background: '#6366f1',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
          }}>
            Active
          </div>
        )}
        <div style={{
          fontSize: 48,
          opacity: 0.3,
          filter: 'grayscale(0.5)',
        }}>
          {world?.name.charAt(0)}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: '#fff',
          marginBottom: 4,
        }}>
          {props.tournament.name}
        </div>
        <div style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.5)',
          marginBottom: 12,
        }}>
          {props.tournament.description}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 12,
        }}>
          <span>Entry: {props.tournament.entryFee || '10 MUSD'}</span>
          <span>Prize: {props.tournament.prizePool || '50 MUSD'}</span>
        </div>

        {props.isActive && props.entered ? (
          <button
            onClick={e => {
              e.stopPropagation();
              props.onStart();
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Play Now
          </button>
        ) : props.isActive && !props.entered ? (
          <button
            onClick={e => {
              e.stopPropagation();
              props.onEnter();
            }}
            disabled={!props.isConnected}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              background: props.isConnected
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: props.isConnected ? '#fff' : 'rgba(255,255,255,0.4)',
              fontSize: 14,
              fontWeight: 600,
              cursor: props.isConnected ? 'pointer' : 'not-allowed',
            }}
          >
            {props.isConnected ? 'Enter Tournament' : 'Connect Wallet'}
          </button>
        ) : (
          <div style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 13,
            textAlign: 'center',
          }}>
            Select to play
          </div>
        )}
      </div>
    </div>
  );
}
