/**
 * WorldLoadingOverlay - Shows loading progress while a Marble world loads.
 * 
 * Displays world name, progress bar, and graceful loading state.
 */

import { type MarbleWorld } from '@/config/worlds';

interface WorldLoadingOverlayProps {
  world: MarbleWorld;
  progress: number; // 0-1 progress, -1 for error
  onDismiss?: () => void;
}

export function WorldLoadingOverlay(props: WorldLoadingOverlayProps) {
  const isError = props.progress < 0;
  const progressPercent = Math.min(Math.abs(props.progress) * 100, 100);
  
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 10,
    transition: 'opacity 0.3s ease',
  };
  
  const cardStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 30, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: '24px 32px',
    maxWidth: 320,
    width: '90%',
    textAlign: 'center',
  };
  
  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
  };
  
  const subtitleStyle: React.CSSProperties = {
    margin: '8px 0 0',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  };
  
  const progressContainerStyle: React.CSSProperties = {
    marginTop: 20,
    height: 6,
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  };
  
  const progressBarStyle: React.CSSProperties = {
    height: '100%',
    width: `${progressPercent}%`,
    background: isError 
      ? 'linear-gradient(90deg, #ef4444, #dc2626)'
      : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  };
  
  const statusStyle: React.CSSProperties = {
    marginTop: 12,
    fontSize: 13,
    color: isError ? '#ef4444' : 'rgba(255, 255, 255, 0.6)',
  };
  
  return (
    <div style={containerStyle} role="status" aria-live="polite">
      <div style={cardStyle}>
        <h3 style={titleStyle}>{props.world.name}</h3>
        <p style={subtitleStyle}>
          {isError ? 'Failed to load world' : 'Loading world...'}
        </p>
        
        {!isError && (
          <div style={progressContainerStyle}>
            <div style={progressBarStyle} />
          </div>
        )}
        
        <div style={statusStyle}>
          {isError 
            ? 'Game will continue with fallback background'
            : `Loading Gaussian splat data... ${Math.round(progressPercent)}%`
          }
        </div>
        
        {isError && props.onDismiss && (
          <button
            onClick={props.onDismiss}
            style={{
              marginTop: 16,
              padding: '8px 20px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * WorldLoadingIndicator - Minimal loading indicator for non-blocking loads.
 */
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
        top: 12,
        right: 12,
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 8,
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 5,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        borderTopColor: '#6366f1',
        animation: 'spin 1s linear infinite',
      }} />
      <span style={{
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.8)',
      }}>
        {props.worldName} {Math.round(progressPercent)}%
      </span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}