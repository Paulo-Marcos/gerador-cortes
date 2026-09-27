import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// D-599: na casca nova o modal veste a moldura do handoff — cartão de vidro,
// cabeçalho e rodapé separados por `--line2`, título 14/700 e subtítulo 11.5
// em `--mute`. O miolo e o rodapé continuam vindo de quem chama: a moldura é
// que passa a ser a mesma em todos os modais do app.

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  // D-542: para o modal que existe para MARCAR algo sobre um quadro de vídeo.
  // Ali a largura não é estética: abaixo de ~600px o retângulo de recorte fica
  // menor que a alça que o arrasta, e a precisão vira sorte.
  '2xl': 'max-w-6xl',
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => dialogRef.current?.focus());
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={
          { background: 'rgb(10 12 18/.5)', backdropFilter: 'blur(3px)' }
        }
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          'card relative flex w-full flex-col overflow-hidden outline-none max-h-[calc(100dvh-48px)]',
          SIZES[size],
        )}
        style={{ boxShadow: '0 24px 64px rgb(0 0 0/.35)' }}
      >
        <header
          className="flex items-start justify-between gap-3 border-b border-[var(--line2)] px-[15px] py-[14px]"
        >
          <div className="min-w-0 flex-1">
            <h2
              className="text-[14px] font-bold leading-[1.3] text-[var(--ink)]"
            >
              {title}
            </h2>
            {description && (
              <p
                className="mt-0.5 text-[11.5px] leading-[1.5] text-[var(--mute)]"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="btn btn-icon btn-ghost shrink-0"
          >
            <X size={14} />
          </button>
        </header>
        <div
          className="flex-1 overflow-y-auto px-[15px] py-[14px]"
        >
          {children}
        </div>
        {footer && (
          <footer
            className="flex flex-wrap items-center justify-end gap-[7px] border-t border-[var(--line2)] px-[15px] py-3"
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
