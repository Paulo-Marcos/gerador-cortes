import * as React from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

// D-1117 · Chip: filtro que se liga e desliga (`aria-pressed`). Ligado = fundo e
// fio de íris + VISTO (a forma, para não depender só da cor, DIRECAO §3.4).
// Desabilitado: fio tracejado e sem fundo. Sem `backdrop-filter` (§3.6).

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  pressionado?: boolean;
  /** Quantidade ao lado do rótulo ("Prontos 6"), em mono. */
  contagem?: number;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { pressionado = false, contagem, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressionado}
      className={cn(
        'inline-flex h-[30px] select-none items-center gap-1.5 whitespace-nowrap rounded-pilula border border-fio-2 bg-transparent px-3 text-pequeno font-semibold leading-none text-fg-2 transition-colors duration-150',
        'hover:bg-vidro-2 hover:text-fg',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        'aria-pressed:border-iris-fio aria-pressed:bg-iris-suave aria-pressed:text-fg',
        'disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-fg-off disabled:hover:bg-transparent disabled:hover:text-fg-off',
        'motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      {pressionado ? <span aria-hidden data-marca="visto" className="inline-flex flex-none text-iris"><Icon name="check" className="size-3" /></span> : null}
      {children}
      {contagem !== undefined ? (
        <span className={cn('font-mono text-micro font-medium tabular-nums', pressionado ? 'text-iris-2' : 'text-fg-3')}>
          {contagem}
        </span>
      ) : null}
    </button>
  );
});
