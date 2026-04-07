import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X, ArrowRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  success: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) => void;
  error:   (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) => void;
  warning: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) => void;
  info:    (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle  size={18} />,
  error:   <AlertCircle  size={18} />,
  warning: <AlertTriangle size={18} />,
  info:    <Info          size={18} />,
};

const variantColors: Record<ToastVariant, string> = {
  success: 'var(--color-success)',
  error:   'var(--color-danger)',
  warning: 'var(--color-warning)',
  info:    'var(--color-info)',
};

function generateId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function UniversalToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const isMobile = useIsMobile();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((variant: ToastVariant, message: string, opts: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>> = {}) => {
    const id = generateId();
    const item: ToastItem = { id, variant, message, duration: DEFAULT_DURATION, ...opts };
    setToasts((prev) => {
      const next = [...prev, item];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
    return id;
  }, []);

  const ctx: ToastContextValue = {
    success: (msg, opts) => push('success', msg, opts),
    error:   (msg, opts) => push('error',   msg, opts),
    warning: (msg, opts) => push('warning', msg, opts),
    info:    (msg, opts) => push('info',    msg, opts),
    dismiss,
  };

  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 'calc(var(--u-header-height-mobile) + env(safe-area-inset-top) + var(--space-3))',
        left: 'var(--space-3)',
        right: 'var(--space-3)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        pointerEvents: 'none',
      }
    : {
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        width: '380px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        pointerEvents: 'none',
      };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div style={containerStyle} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const { id, variant, message, duration = DEFAULT_DURATION, action } = item;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(id), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [id, duration, onDismiss]);

  const accent = variantColors[variant];

  return (
    <div
      data-testid={`toast-${variant}`}
      role="alert"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--color-bg-secondary)',
        border: `1px solid var(--color-border-default)`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        animation: 'u-toast-in var(--duration-normal) var(--ease-out) both',
        position: 'relative',
      }}
    >
      <span style={{ color: accent, flexShrink: 0, marginTop: '1px' }}>{variantIcons[variant]}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', color: 'var(--color-text-primary)', lineHeight: 'var(--leading-normal)' as any }}>
          {message}
        </p>
        {action && (
          <button
            onClick={() => { action.onClick(); onDismiss(id); }}
            style={{
              marginTop: 'var(--space-2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--weight-semibold)' as any,
              color: accent,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {action.label}
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text-disabled)',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useUniversalToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useUniversalToast must be used within UniversalToastProvider');
  return ctx;
}

export { ToastContext };
