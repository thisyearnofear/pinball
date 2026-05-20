import React, { useRef, useState } from 'react';
import { getWorldById } from '@/config/worlds';

interface ShareCardProps {
  score: number;
  worldId: string;
  tournamentName?: string;
  onDismiss: () => void;
  onShare?: () => void;
}

export function ShareCard(props: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const world = getWorldById(props.worldId);
  const gradient = world?.gradient || 'linear-gradient(135deg, #1a0a2e, #0f0f23)';

  function handleCopy() {
    const text = `🎯 Mezo Pinball Arcade\n` +
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
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      zIndex: 950,
    }}>
      <div
        ref={cardRef}
        style={{
          width: 'min(400px, 100%)',
          borderRadius: 20,
          overflow: 'hidden',
          background: '#0c0c0c',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
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
          <div style={{
            position: 'relative',
            textAlign: 'center',
            color: '#fff',
          }}>
            <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>
              {props.tournamentName || 'Practice'}
            </div>
            <div style={{ fontSize: 48, fontWeight: 700 }}>
              {props.score.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>World</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                {world?.name || props.worldId}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Score</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                {props.score.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 8,
                background: copied ? '#22c55e' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {copied ? 'Copied!' : 'Copy Score'}
            </button>
            <button
              onClick={props.onDismiss}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
