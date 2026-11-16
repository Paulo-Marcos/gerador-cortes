import * as React from 'react';
import { cn } from '@/lib/utils';
import { BolinhaDoRadio, useItemDoGrupo } from './radio';

// D-1116 (E-069 H-08): escolha única com explicação, no lugar do "selecionado" de fundo
// vermelho de Configurações. É um rádio grande: mesmo grupo (`GrupoDeRadio`), mesmo
// teclado. Escolhido = vidro de íris + fio de íris (§3.4), nunca cor de erro.
export type CartaoDeOpcaoProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'title' | 'children'
> & {
  value: string;
  titulo: string;
  descricao?: string;
  /** Pré-visualização opcional abaixo do texto (ex.: miniatura do layout). */
  children?: React.ReactNode;
};

export const CartaoDeOpcao = React.forwardRef<HTMLButtonElement, CartaoDeOpcaoProps>(
  ({ value, titulo, descricao, children, className, disabled, ...props }, ref) => {
    const { marcado, escolher, tabIndex } = useItemDoGrupo(value);
    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={marcado}
        tabIndex={tabIndex}
        disabled={disabled}
        onClick={escolher}
        className={cn(
          'group relative flex min-w-0 flex-col gap-2.5 rounded-bloco border border-fio bg-vidro p-3.5 text-left',
          'transition-[background-color,border-color] duration-150',
          'hover:border-fio-2 hover:bg-vidro-2',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
          'aria-checked:border-iris-fio aria-checked:bg-iris-suave aria-checked:hover:border-iris-fio aria-checked:hover:bg-iris-suave',
          'disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-fg-off disabled:hover:border-fio disabled:hover:bg-transparent',
          className,
        )}
        {...props}
      >
        <span className="flex items-start gap-2.5">
          <BolinhaDoRadio marcado={marcado} className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold leading-5 text-fg group-disabled:text-fg-off">
              {titulo}
            </span>
            {descricao && <span className="text-xs leading-4 text-fg-3">{descricao}</span>}
          </span>
        </span>
        {children}
      </button>
    );
  },
);
CartaoDeOpcao.displayName = 'CartaoDeOpcao';
