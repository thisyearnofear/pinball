import React from 'react';
import { colors, radius, spacing, shadows, transitions } from '@/theme/tokens';

interface CardProps {
  children: React.ReactNode;
  padding?: number;
  interactive?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Card({ children, padding = spacing.lg, interactive = false, onClick, style }: CardProps) {
  const [hovered, setHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    background: colors.background.surface,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radius.lg,
    padding,
    transition: `all ${transitions.normal}`,
    cursor: interactive ? 'pointer' : undefined,
    ...(interactive && hovered && {
      borderColor: colors.border.emphasis,
      transform: 'translateY(-2px)',
      boxShadow: shadows.md,
    }),
    ...style,
  };

  return (
    <div
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
    >
      {children}
    </div>
  );
}
