import * as React from 'react';
import { Icon } from '@/upgrade/Icon';
import { cn } from '@/lib/utils';
import { CLASSES_DO_CAMPO, useLigacaoDoCampo } from './field';
import { GiroDoCampo } from './input';

// D-1116 (E-069 H-08): a busca é pílula (§3.2: "tudo que se aperta ou informa em uma
// linha"), com lupa à esquerda e um "limpar" que só existe com texto. Controlada: quem
// usa guarda o valor, e `aoMudar` recebe o texto, não o evento.
export type BuscaProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: string;
  aoMudar: (texto: string) => void;
  carregando?: boolean | string;
};

export const Busca = React.forwardRef<HTMLInputElement, BuscaProps>(
  ({ className, value, aoMudar, carregando, id, placeholder, disabled, ...props }, ref) => {
    const campo = useLigacaoDoCampo();
    const frase = typeof carregando === 'string' ? carregando : 'Carregando…';
    const podeLimpar = value !== '' && !disabled && !carregando;
    return (
      <div role="search" className="relative w-full">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3">
          <Icon name="search" size={16} />
        </span>
        <input
          ref={ref}
          type="search"
          data-sala=""
          id={id ?? campo?.id}
          value={value}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={carregando ? frase : placeholder}
          disabled={disabled || Boolean(carregando)}
          aria-busy={carregando ? true : undefined}
          aria-describedby={props['aria-describedby'] ?? campo?.describedBy}
          className={cn(
            CLASSES_DO_CAMPO,
            'h-10 rounded-pilula pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none',
            className,
          )}
          {...props}
        />
        {carregando ? (
          <GiroDoCampo />
        ) : (
          podeLimpar && (
            <button
              type="button"
              data-sala=""
              aria-label="Limpar busca"
              onClick={() => aoMudar('')}
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-fg-3 transition-colors hover:bg-vidro-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
            >
              <Icon name="x" size={14} />
            </button>
          )
        )}
      </div>
    );
  },
);
Busca.displayName = 'Busca';
