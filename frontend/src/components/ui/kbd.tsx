import * as React from 'react';
import { cn } from '@/lib/utils';

/** A tecla do atalho ("Ctrl", "K"): fonte mono, vidro e fio de 1 px. Só mostra, não aperta. */
export const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-etiqueta border border-fio-2 bg-vidro px-1.5 font-mono text-micro leading-none text-fg-2',
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = 'Kbd';
