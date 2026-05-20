import React from 'react';
import { getTournamentWorld, type TournamentMeta } from '@/config/tournaments';
import { getWorldById } from '@/config/worlds';

interface WorldPreviewProps {
  tournamentId: number;
  size?: 'small' | 'large';
  onClick?: () => void;
}

export function WorldPreview(props: WorldPreviewProps) {
  const world = getTournamentWorld(props.tournamentId);
  const gradient = world?.gradient || 'linear-gradient(135deg, #1a0a2e, #0f0f23)';
  const size = props.size || 'small';
  
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: size === 'small' ? 120 : 200,
    borderRadius: 8,
    overflow: 'hidden',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: props.onClick ? 'pointer' : 'default',
    transition: 'transform 0.2s ease',
    ...(props.onClick && {
      transform: 'scale(1.02)',
    }),
  };
  
  const textStyle: React.CSSProperties = {
    padding: 12,
    textAlign: 'center',
    color: '#fff',
    fontSize: size === 'small' ? 14 : 18,
    fontWeight: 600,
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  };

  return (
    <div style={containerStyle} onClick={props.onClick}>
      <div style={textStyle}>
        {world?.name || 'Unknown World'}
      </div>
    </div>
  );
}

interface TournamentCardProps {
  tournamentId: number;
  name: string;
  entryFee: string;
  prizePool: string;
  onPlay: () => void;
}

export function TournamentCard(props: TournamentCardProps) {
  const world = getTournamentWorld(props.tournamentId);
  
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 12,
      padding: 16,
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      <WorldPreview tournamentId={props.tournamentId} size="small" />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
          {props.name}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
          Entry: {props.entryFee} • Prize: {props.prizePool}
        </div>
      </div>
      <button
        onClick={props.onPlay}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '10px 16px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          border: 'none',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Play Now
      </button>
    </div>
  );
}
