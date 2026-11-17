import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';

// D-1122 (E-069 H-11b): o aviso da Sala escura — pílula de 18 px de raio, o sinal do tom
// num círculo de 32 px, título em negrito e o resto em `fg-2`. Mantém o que a D-599
// decidiu: sobe 74 px do rodapé, porque a barra de ações fixa mora ali e um aviso que
// tapa o botão primário atrapalha exatamente quem avisou. Sem `backdrop-filter` (§3.6).
//
// O viewport é uma região `aria-live`: o leitor de tela anuncia cada aviso que entra,
// sem tirar o foco de onde o operador estava. O erro é `role="alert"` (anunciado já).

const COR_DO_TOM: Record<ToastTone, string> = {
  success: '[--c:var(--cc-ok)]',
  info: '[--c:var(--cc-info)]',
  warning: '[--c:var(--cc-aviso)]',
  error: '[--c:var(--cc-erro)]',
};

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  conteudo?: ReactNode;
}

interface NotifyOptions {
  title?: string;
  tone?: ToastTone;
  /** D-1088: botões do próprio aviso (o motivo e o Desfazer do corte riscado).
   *  O aviso mora acima do QueryClient: o conteúdo recebe as ações prontas. */
  conteudo?: ReactNode;
  /** Quanto tempo o aviso fica; o padrão é curto, para quem só lê. */
  duracaoMs?: number;
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
        conteudo: options.conteudo,
      };

      setToasts((current) => [...current, toast]);
      window.setTimeout(() => dismiss(id), options.duracaoMs ?? 3200);
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

/** Exportado para o teste: o aviso desenha o conteúdo que a tela mandou (D-1088). */
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions removals"
      className="pointer-events-none fixed bottom-[74px] right-5 z-[80] grid w-[min(380px,calc(100vw-40px))] gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          data-tone={toast.tone}
          className={cn(
            'pointer-events-none flex items-center gap-3 rounded-[18px] border border-fio-2 bg-pop py-2.5 pl-2.5 pr-3.5 text-fg shadow-pop-luz',
            'animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none',
            COR_DO_TOM[toast.tone],
          )}
        >
          <span className="inline-grid size-8 flex-none place-items-center rounded-full bg-[color-mix(in_srgb,var(--c)_16%,transparent)] text-[var(--c)]">
            <Icon name={ICONE_DO_TOM[toast.tone]} />
          </span>
          <span className="min-w-0 flex-1 text-pequeno">
            {toast.title ? <b className="font-bold">{toast.title} </b> : null}
            <span className="font-normal text-fg-2">{toast.message}</span>
            {toast.conteudo ? <span className="pointer-events-auto mt-1.5 block">{toast.conteudo}</span> : null}
          </span>
          <IconButton
            variant="fantasma"
            size="pq"
            aria-label="Fechar aviso"
            title="Fechar aviso"
            onClick={() => onDismiss(toast.id)}
            className="pointer-events-auto"
          >
            <Icon name="x" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
