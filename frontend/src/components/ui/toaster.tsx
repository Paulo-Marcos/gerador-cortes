import { Bell, Check, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface Toast {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
}

interface NotifyOptions {
  title?: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  notify: (message: string, options?: NotifyOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_META: Record<ToastTone, { Icon: LucideIcon; className: string; iconClassName: string }> =
  {
    success: {
      Icon: Check,
      className: 'border-success/30 bg-[color-mix(in_oklch,var(--success)_12%,var(--wb-bg-card))]',
      iconClassName: 'bg-success text-white',
    },
    info: {
      Icon: Info,
      className: 'border-info/30 bg-[color-mix(in_oklch,var(--info)_10%,var(--wb-bg-card))]',
      iconClassName: 'bg-info text-white',
    },
    warning: {
      Icon: TriangleAlert,
      className: 'border-warning/30 bg-[color-mix(in_oklch,var(--warning)_12%,var(--wb-bg-card))]',
      iconClassName: 'bg-warning text-white',
    },
    error: {
      Icon: Bell,
      className: 'border-error/30 bg-[color-mix(in_oklch,var(--error)_12%,var(--wb-bg-card))]',
      iconClassName: 'bg-error text-white',
    },
  };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, options: NotifyOptions = {}) => {
      const id = crypto.randomUUID();
      const toast: Toast = {
        id,
        message,
        title: options.title,
        tone: options.tone ?? 'success',
      };

      setToasts((current) => [...current, toast]);
      window.setTimeout(() => dismiss(id), 3200);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions removals"
      className="pointer-events-none fixed bottom-5 right-5 z-[80] grid w-[min(360px,calc(100vw-40px))] gap-2"
    >
      {toasts.map((toast) => {
        const tone = TONE_META[toast.tone];
        const Icon = tone.Icon;

        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto grid min-h-[54px] grid-cols-[34px_minmax(0,1fr)_28px] items-center gap-2 rounded-lg border p-2.5 shadow-lg animate-in fade-in slide-in-from-bottom-1',
              tone.className,
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)]',
                tone.iconClassName,
              )}
            >
              <Icon size={15} aria-hidden />
            </span>
            <span className="min-w-0 text-sm font-semibold leading-snug text-[var(--wb-text)]">
              {toast.title && (
                <span className="block text-xs text-[var(--wb-text-mute)]">{toast.title}</span>
              )}
              {toast.message}
            </span>
            <IconButton
              aria-label="Fechar aviso"
              title="Fechar aviso"
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={14} aria-hidden />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
