import * as React from 'react';
import { cn } from '@/lib/utils';
import { CLASSES_DO_CAMPO, useLigacaoDoCampo } from './field';

// D-599: na casca nova o campo e o `.fld` do handoff — 30 px, canto de 4 px,
// fundo `--inset`. A borda de foco continua em acento.
//
// D-1116 (E-069 H-08): `aparencia="sala"` é o campo da Sala escura (40 px, canto de 12,
// poço e fio de campo, §3.4). O padrão continua `atual` para nenhuma tela mudar de cara
// até a sua história de migração; a H-24 apaga esta ponte e o `atual`.

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  aparencia?: 'atual' | 'sala';
  invalido?: boolean;
  /** Busca em andamento: `true` mostra "Carregando…"; um texto diz o que se busca. */
  carregando?: boolean | string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, aparencia = 'atual', invalido, carregando, id, placeholder, disabled, ...props },
    ref,
  ) => {
    const campo = useLigacaoDoCampo();
    if (aparencia === 'atual') {
      return (
        <input
          ref={ref}
          id={id ?? campo?.id}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={campo?.invalido ? true : undefined}
          aria-describedby={props['aria-describedby'] ?? campo?.describedBy}
          className={cn(
            'fld w-full placeholder:text-[var(--dim)] focus-visible:border-[var(--accent)] focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
      );
    }
    const frase = typeof carregando === 'string' ? carregando : 'Carregando…';
    return (
      <div className="relative w-full">
        <input
          ref={ref}
          id={id ?? campo?.id}
          data-sala=""
          placeholder={carregando ? frase : placeholder}
          disabled={disabled || Boolean(carregando)}
          aria-busy={carregando ? true : undefined}
          aria-invalid={(invalido ?? campo?.invalido) ? true : undefined}
          aria-describedby={props['aria-describedby'] ?? campo?.describedBy}
          required={props.required ?? campo?.obrigatorio}
          className={cn(CLASSES_DO_CAMPO, 'h-10 px-3.5', carregando && 'pr-10', className)}
          {...props}
        />
        {carregando && <GiroDoCampo />}
      </div>
    );
  },
);
Input.displayName = 'Input';

/** Giro do estado "carregando" (§3.4); só gira com movimento permitido. */
export function GiroDoCampo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-iris/30 border-t-iris motion-safe:animate-spin',
        className,
      )}
    />
  );
}
