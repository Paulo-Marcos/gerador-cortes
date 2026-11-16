import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1117 · Etiqueta: rótulo de categoria, canto de 6 (ladrilho, não pílula) e
// sem cor de estado. Quem diz "de quem é a vez" é o Selo; a Etiqueta só classifica.
export const Etiqueta = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  function Etiqueta({ className, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex h-5 select-none items-center whitespace-nowrap rounded-etiqueta bg-vidro-2 px-2 text-[11px] font-semibold leading-none text-fg-2',
          className,
        )}
        {...props}
      />
    );
  },
);
