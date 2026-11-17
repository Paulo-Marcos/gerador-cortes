import * as React from 'react';
import { Icon } from '@/upgrade/Icon';
import { cn } from '@/lib/utils';

// D-1116 (E-069 H-08): caixa de marcar para o que vale ao salvar. `checked` aceita
// `'mixed'` (marcação parcial de um grupo). Etiqueta (raio 6, §3.2), visto em `sobre-iris`.
export type CheckboxProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean | 'mixed';
  onCheckedChange: (marcado: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked, onCheckedChange, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(checked !== true)}
      className={cn(
        'inline-flex size-[18px] flex-none items-center justify-center rounded-etiqueta border border-campo bg-poco p-0 text-sobre-iris',
        'transition-[background-color,border-color] duration-150',
        'hover:border-fg/[.62]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        'aria-[checked=true]:border-iris aria-[checked=true]:bg-iris aria-[checked=mixed]:border-iris aria-[checked=mixed]:bg-iris',
        'disabled:cursor-not-allowed disabled:border-dashed disabled:border-fio-2 disabled:bg-transparent disabled:text-fg-off disabled:hover:border-fio-2',
        className,
      )}
      {...props}
    >
      {checked === true && <Icon name="check" size={14} className="[&>*]:stroke-[2.6]" />}
      {checked === 'mixed' && <Icon name="minus" size={14} className="[&>*]:stroke-[2.6]" />}
    </button>
  ),
);
Checkbox.displayName = 'Checkbox';
