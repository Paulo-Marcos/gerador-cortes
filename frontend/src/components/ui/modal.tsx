import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-[var(--radius-lg)]',
          'border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] shadow-[shadow:var(--wb-shadow)] outline-none',
          'max-h-[85vh]',
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-editorial text-[17px] font-medium leading-snug text-[var(--wb-text)]">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 font-code text-[10.5px] text-[var(--wb-text-dim)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-4 py-2.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
