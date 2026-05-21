import React, { useEffect, useRef, useCallback, useState } from 'react';
import { colors, radius, spacing, typography, zIndex } from '@/theme/tokens';
import { useIsSmallScreen } from '@/hooks/use-media-query';
import { Button } from './Button';

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

const sizeWidths = {
  sm: 'min(480px, 90vw)',
  md: 'min(640px, 90vw)',
  lg: 'min(820px, 90vw)',
};

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function trapFocus(container: HTMLElement, e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)) as HTMLElement[];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function Modal({ title, onClose, children, footer, size = 'md' }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isSmall = useIsSmallScreen();
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const firstFocusable = el.querySelector(FOCUSABLE_SELECTORS) as HTMLElement;
    if (firstFocusable) firstFocusable.focus();
    else el.setAttribute('tabindex', '0');

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      trapFocus(el, e);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.touches[0].clientY - touchStart;
    if (diff > 80) onClose();
  }, [touchStart, onClose]);

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
  }, []);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        background: colors.background.overlay,
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: isSmall ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isSmall ? 0 : spacing.lg,
        zIndex: zIndex.modal,
        animation: 'fadeIn 150ms ease',
      }}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={contentRef}
        style={{
          width: isSmall ? '100%' : sizeWidths[size],
          maxHeight: isSmall ? '90vh' : '85vh',
          overflow: 'auto',
          background: colors.background.surface,
          color: colors.text.primary,
          border: isSmall ? 'none' : `1px solid ${colors.border.default}`,
          borderRadius: isSmall ? `${radius.xl}px ${radius.xl}px 0 0` : radius.lg,
          padding: isSmall ? `${spacing.lg}px ${spacing.lg}px ${spacing.xl}px` : spacing.xl,
          animation: isSmall ? 'slideUpMobile 250ms ease' : 'slideUp 200ms ease',
          boxShadow: isSmall ? 'none' : '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {isSmall && (
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: colors.border.emphasis,
            margin: '0 auto',
            marginBottom: spacing.md,
          }} />
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.lg,
          marginBottom: spacing.lg,
        }}>
          <h2 style={{
            margin: 0,
            fontSize: isSmall ? typography.size.lg : typography.size.xl,
            fontWeight: typography.weight.semibold,
            color: colors.text.primary,
          }}>
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              fontSize: typography.size.xl,
              padding: isSmall ? '8px 12px' : '4px 8px',
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
            }}
          >
            ×
          </Button>
        </div>

        <div style={{ color: colors.text.secondary }}>
          {children}
        </div>

        {footer && (
          <div style={{
            marginTop: spacing.xl,
            paddingTop: spacing.lg,
            borderTop: `1px solid ${colors.border.subtle}`,
            display: 'flex',
            gap: spacing.md,
            flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
