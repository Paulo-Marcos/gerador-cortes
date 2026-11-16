import * as React from 'react';
import { cn } from '@/lib/utils';
import { GiroDoCampo } from './input';

// D-1116 (E-069 H-08): interruptor de efeito imediato ("ligar o que já vale"). Para
// escolher algo que só vale ao salvar, use `Checkbox`. `<button role="switch">` com
// `aria-checked`; a bolinha só anda com `transform` (§3.5) e fica parada com
// `prefers-reduced-motion`.
export type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange: (ligado: boolean) => void;
  carregando?: boolean;
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, carregando, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={carregando ? true : undefined}
      disabled={disabled || carregando}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-block h-6 w-10 flex-none rounded-pilula border border-campo bg-poco p-0',
        'transition-[background-color,border-color] duration-150',
        'hover:border-fg/60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        'aria-checked:border-iris aria-checked:bg-iris aria-checked:hover:border-iris',
        'disabled:cursor-not-allowed disabled:border-dashed disabled:border-fio-2 disabled:bg-transparent disabled:hover:border-fio-2',
        // A bolinha.
        'after:absolute after:left-[3px] after:top-[3px] after:size-4 after:rounded-full after:bg-fg-2 after:content-[""]',
        'after:transition-[transform,background-color] after:duration-[160ms] motion-reduce:after:transition-none',
        'aria-checked:after:translate-x-4 aria-checked:after:bg-sobre-iris',
        'disabled:after:bg-fg-off',
        className,
      )}
      {...props}
    >
      {carregando && <GiroDoCampo className="right-1/2 size-3 translate-x-1/2" />}
    </button>
  ),
);
Switch.displayName = 'Switch';
