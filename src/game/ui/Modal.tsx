import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useIsSmallScreen } from '@/hooks/use-media-query';
import { Button } from './Button';
import styles from './Modal.module.scss';

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
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

  const sizeClass = `size${size.charAt(0).toUpperCase()}${size.slice(1)}` as 'sizeSm' | 'sizeMd' | 'sizeLg';

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`${styles.overlay} ${isSmall ? styles.overlayMobile : ''}`}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={contentRef}
        className={`${styles.content} ${styles[sizeClass]} ${isSmall ? styles.contentMobile : ''}`}
      >
        {isSmall && <div className={styles.dragHandle} />}

        <div className={styles.header}>
          <h2 className={styles.title}>
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
            className={styles.closeButton}
          >
            ×
          </Button>
        </div>

        <div className={styles.body}>
          {children}
        </div>

        {footer && (
          <div className={styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
