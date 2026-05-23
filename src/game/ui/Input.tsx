import React from 'react';
import { colors, radius, spacing, typography, transitions } from '@/theme/tokens';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  const [focused, setFocused] = React.useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: `${spacing.sm}px ${spacing.md}px`,
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${error ? colors.status.error : focused ? colors.border.focus : colors.border.default}`,
    borderRadius: radius.md,
    color: colors.text.primary,
    fontSize: typography.size.md,
    transition: `all ${transitions.fast}`,
    outline: 'none',
    ...style,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {label && (
        <label style={{
          fontSize: typography.size.sm,
          color: colors.text.secondary,
          fontWeight: typography.weight.medium,
        }}>
          {label}
        </label>
      )}
      <input
        style={inputStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && (
        <span style={{
          fontSize: typography.size.xs,
          color: colors.status.error,
        }}>
          {error}
        </span>
      )}
    </div>
  );
}
