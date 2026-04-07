import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface UniversalSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: number[];
  defaultSnap?: number;
  'data-testid'?: string;
}

export function UniversalSheet({
  open,
  onClose,
  title,
  children,
  snapPoints = [0.5, 1.0],
  defaultSnap = 0,
  'data-testid': testId,
}: UniversalSheetProps) {
  const isMobile = useIsMobile();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState(defaultSnap);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!open) setCurrentSnap(defaultSnap);
  }, [open, defaultSnap]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const snapHeight = (idx: number) =>
    `${(snapPoints[idx] ?? snapPoints[snapPoints.length - 1]) * 100}dvh`;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = sheetRef.current?.getBoundingClientRect().height ?? 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const delta = dragStartY.current - e.clientY;
    const newH = Math.max(50, dragStartHeight.current + delta);
    sheetRef.current.style.height = `${newH}px`;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;

    const currentH = sheetRef.current.getBoundingClientRect().height;
    const windowH = window.innerHeight;
    const ratio = currentH / windowH;

    const velocity = (dragStartY.current - e.clientY) / (Date.now() % 1000 || 1);

    if (velocity < -0.3 || ratio < (snapPoints[0] ?? 0.3) * 0.5) {
      onClose();
      return;
    }

    let closest = 0;
    let closestDist = Infinity;
    snapPoints.forEach((sp, i) => {
      const dist = Math.abs(ratio - sp);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });

    setCurrentSnap(closest);
    sheetRef.current.style.height = '';
  }, [snapPoints, onClose]);

  if (!open) return null;

  if (!isMobile) {
    return (
      <div
        data-testid={testId}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-index-modal-backdrop)' as any,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6)',
        }}
      >
        <div
          onClick={onClose}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'relative',
            zIndex: 'var(--z-index-modal)' as any,
            width: '100%',
            maxWidth: '480px',
            maxHeight: '70vh',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-default)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {title && (
            <div style={{ flexShrink: 0, padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-semibold)' as any, color: 'var(--color-text-primary)' }}>{title}</h3>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)' }}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-index-sheet-backdrop)' as any,
        display: 'flex',
        alignItems: 'flex-end',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          zIndex: 'var(--z-index-sheet)' as any,
          width: '100%',
          height: snapHeight(currentSnap),
          maxHeight: '95dvh',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          borderTop: '1px solid var(--color-border-default)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transition: isDragging.current ? 'none' : `height var(--duration-slow) var(--ease-out)`,
          animation: 'u-sheet-up var(--duration-slow) var(--ease-out) both',
        }}
      >
        {/* Drag handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            padding: 'var(--space-3) 0',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-border-emphasis)' }} />
        </div>

        {title && (
          <div style={{ flexShrink: 0, padding: '0 var(--space-6) var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-semibold)' as any, color: 'var(--color-text-primary)' }}>{title}</h3>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, padding: '0 var(--space-6) var(--space-4)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
