import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/upgrade/Icon';

// D-599: na casca nova o aviso vira o toast do handoff — cartão de vidro no
// canto, ícone colorido pelo tom, título em negrito e o resto em `--mute`.
// Ele sobe para 74 px do rodapé porque a barra de ações fixa mora ali: um
// aviso que tapa o botão primário atrapalha exatamente quem avisou.

const AP_TOM: Record<ToastTone, string> = {
  success: 'var(--ok)',
  info: 'var(--info)',
  warning: 'var(--warn)',
  error: 'var(--err)',
};

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

const ICONE_DO_TOM: Record<ToastTone, IconName> = {
  success: 'check',
  info: 'info',
  warning: 'triangle-alert',
  error: 'bell',
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
      className={cn(
        'pointer-events-none fixed right-5 z-[80] grid w-[min(360px,calc(100vw-40px))] gap-2',
        'bottom-[74px]',
      )}
    >
      {toasts.map((toast) => {
        return (
          <div
            key={toast.id}
            className="card pointer-events-none flex items-center gap-[9px] p-[10px_12px] animate-in fade-in slide-in-from-bottom-1"
            style={{ padding: '10px 12px', boxShadow: '0 18px 44px rgb(0 0 0/.3)' }}
          >
            <Icon name={ICONE_DO_TOM[toast.tone]} style={{ color: AP_TOM[toast.tone], flex: 'none' }} />
            <span className="min-w-0 flex-1 text-[12px] leading-[1.45]">
              {toast.title ? <b>{toast.title} </b> : null}
              <span style={{ color: 'var(--mute)' }}>{toast.message}</span>
            </span>
            <button
              type="button"
              aria-label="Fechar aviso"
              title="Fechar aviso"
              onClick={() => onDismiss(toast.id)}
              className="btn btn-icon btn-ghost pointer-events-auto"
              style={{ width: 22, height: 22 }}
            >
              <Icon name="x" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
