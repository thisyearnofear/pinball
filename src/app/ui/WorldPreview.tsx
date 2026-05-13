/**
 * WorldPreview - Shows a preview of a Marble world for tournament cards.
 * 
 * Displays a poster image or video still from the world.
 */

import { getTournamentWorld, type TournamentMeta } from '@/config/tournaments';
import { MARBLE_WORLDS, type MarbleWorld } from '@/config/worlds';

interface WorldPreviewProps {
  /** Tournament ID to preview */
  tournamentId: number;
  /** Optional size: small for cards, large for featured */
  size?: 'small' | 'large';
  /** Click handler */
  onClick?: () => void;
}

/**
 * Get the poster URL for a world (uses the world's description as fallback text)
 */
function getWorldPosterUrl(world: MarbleWorld | null): string | null {
  if (!world) return null;
  // TODO: Use actual Marble keyframe video still when available
  // For now, return null to show text fallback
  return null;
}

export function WorldPreview(props: WorldPreviewProps) {
  const world = getTournamentWorld(props.tournamentId);
  const posterUrl = getWorldPosterUrl(world);
  const size = props.size || 'small';
  
  const containerStyle: React.CSSProperties = {
    width: size === 'small' ? '100%' : '100%',
    height: size === 'small' ? 120 : 200,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'linear-gradient(180deg, #1a0a2e 0%, #16213e 50%, #0f0f23 100%)',
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
  };
  
  if (posterUrl) {
    return (
      <div style={containerStyle} onClick={props.onClick}>
        <img 
          src={posterUrl} 
          alt={world?.name || 'World preview'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }
  
  // Fallback: show world name
  return (
    <div style={containerStyle} onClick={props.onClick}>
      <div style={textStyle}>
        {world?.name || 'Unknown World'}
      </div>
    </div>
  );
}

/**
 * TournamentCard - A card showing tournament info with world preview
 */
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