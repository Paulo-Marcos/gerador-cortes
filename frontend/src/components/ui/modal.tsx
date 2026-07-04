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
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
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
          'bg-surface-1 border border-[var(--border)] shadow-lg outline-none',
          'max-h-[85vh]',
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-100">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-text-300">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-300 hover:bg-bg-800 hover:text-text-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
