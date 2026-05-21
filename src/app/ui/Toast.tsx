import React, { createContext, useContext, useState, useCallback } from 'react';
import { colors, radius, spacing, typography, zIndex, transitions } from '@/theme/tokens';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

const typeColors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  info: { bg: 'rgba(59, 130, 246, 0.15)', border: colors.status.info, icon: 'ℹ' },
  success: { bg: 'rgba(34, 197, 94, 0.15)', border: colors.status.success, icon: '✓' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', border: colors.status.warning, icon: '⚠' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', border: colors.status.error, icon: '✕' },
};

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: spacing.lg,
      right: spacing.lg,
      zIndex: zIndex.toast,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
      maxWidth: 360,
    }}>
      {toasts.map(toast => {
        const tc = typeColors[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              background: colors.background.elevated,
              border: `1px solid ${tc.border}`,
              borderLeft: `3px solid ${tc.border}`,
              borderRadius: radius.md,
              padding: `${spacing.md}px ${spacing.lg}px`,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              animation: 'slideUp 200ms ease',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            <span style={{
              fontSize: typography.size.lg,
              color: tc.border,
              fontWeight: typography.weight.bold,
            }}>
              {tc.icon}
            </span>
            <span style={{
              flex: 1,
              fontSize: typography.size.sm,
              color: colors.text.primary,
              lineHeight: typography.lineHeight.normal,
            }}>
              {toast.message}
            </span>
            <button
              onClick={() => onRemove(toast.id)}
              style={{
                color: colors.text.muted,
                fontSize: typography.size.lg,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
