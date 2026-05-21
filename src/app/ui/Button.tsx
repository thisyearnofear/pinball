import React from 'react';
import { colors, radius, typography, spacing, transitions } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: typography.size.sm,
    borderRadius: radius.md,
  },
  md: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    fontSize: typography.size.md,
    borderRadius: radius.md,
  },
  lg: {
    padding: `${spacing.md}px ${spacing.xl}px`,
    fontSize: typography.size.lg,
    borderRadius: radius.lg,
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: fullWidth ? '100%' : undefined,
    transition: `all ${transitions.normal}`,
    opacity: disabled || loading ? 0.5 : 1,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    minHeight: 44,
    minWidth: 44,
    transform: pressed ? 'scale(0.97)' : hovered ? 'translateY(-1px)' : 'none',
    ...sizeStyles[size],
  };

  const variantStyle: React.CSSProperties = {
    primary: {
      background: 'var(--world-gradient, linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%))',
      color: colors.text.primary,
      fontWeight: typography.weight.semibold,
      border: 'none',
      boxShadow: 'var(--world-glow, 0 2px 8px rgba(99, 102, 241, 0.3))',
    },
    secondary: {
      background: hovered ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)',
      color: colors.text.primary,
      fontWeight: typography.weight.medium,
      border: `1px solid ${colors.border.default}`,
    },
    ghost: {
      background: hovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
      color: hovered ? colors.text.primary : colors.text.secondary,
      fontWeight: typography.weight.medium,
      border: 'none',
    },
    danger: {
      background: colors.status.error,
      color: colors.text.primary,
      fontWeight: typography.weight.semibold,
      border: 'none',
    },
  }[variant];

  return (
    <button
      disabled={disabled || loading}
      style={{ ...baseStyle, ...variantStyle, ...style }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        setPressed(false);
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        setPressed(true);
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        onMouseUp?.(e);
      }}
      {...props}
    >
      {loading && (
        <div style={{
          width: 14,
          height: 14,
          border: `2px solid ${colors.text.disabled}`,
          borderTopColor: colors.text.primary,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      )}
      {children}
    </button>
  );
}
