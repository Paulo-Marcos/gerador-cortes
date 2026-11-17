import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1116 (E-069 H-08): rádio e o seu grupo. O grupo guarda o valor e faz o teclado do
// WAI-ARIA: setas movem o foco e já escolhem; só o item marcado (ou o primeiro, se nada
// está marcado) entra na ordem do Tab. `CartaoDeOpcao` usa o mesmo grupo.

type GrupoCtx = { value: string | undefined; escolher: (v: string) => void; name?: string };
const Grupo = React.createContext<GrupoCtx | null>(null);

/** Estado do item dentro do grupo; um item solto fora de grupo é um erro de uso. */
export function useItemDoGrupo(valor: string) {
  const g = React.useContext(Grupo);
  if (!g) throw new Error('Radio/CartaoDeOpcao precisa estar dentro de um GrupoDeRadio.');
  const marcado = g.value === valor;
  return {
    marcado,
    escolher: () => g.escolher(valor),
    // Sem seleção, todos são alcançáveis; com seleção, só o marcado.
    tabIndex: marcado || g.value === undefined ? 0 : -1,
  };
}

/** Índice do próximo item do grupo para a tecla, ou `null` se a tecla não navega (circular). */
export function proximoDoGrupo(total: number, atual: number, tecla: string): number | null {
  if (total <= 0 || atual < 0) return null;
  if (tecla === 'ArrowDown' || tecla === 'ArrowRight') return (atual + 1) % total;
  if (tecla === 'ArrowUp' || tecla === 'ArrowLeft') return (atual - 1 + total) % total;
  return null;
}

export type GrupoDeRadioProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  value: string | undefined;
  onValueChange: (valor: string) => void;
  /** Nome do grupo para o leitor de tela (obrigatório: o grupo não tem rótulo visível próprio). */
  'aria-label': string;
};

export function GrupoDeRadio({
  value,
  onValueChange,
  className,
  onKeyDown,
  children,
  ...props
}: GrupoDeRadioProps) {
  const ctx = React.useMemo(() => ({ value, escolher: onValueChange }), [value, onValueChange]);
  const aoTeclar = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    const itens = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'),
    );
    const i = proximoDoGrupo(
      itens.length,
      itens.indexOf(document.activeElement as HTMLElement),
      e.key,
    );
    if (i === null) return;
    e.preventDefault();
    const proximo = itens[i];
    proximo.focus();
    proximo.click();
  };
  return (
    <Grupo.Provider value={ctx}>
      <div role="radiogroup" className={className} onKeyDown={aoTeclar} {...props}>
        {children}
      </div>
    </Grupo.Provider>
  );
}

export type RadioProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange'
> & {
  value: string;
};

/** O círculo do rádio, sem o botão em volta (o cartão o reaproveita). */
export function BolinhaDoRadio({ marcado, className }: { marcado: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-marcado={marcado || undefined}
      className={cn(
        'inline-grid size-[18px] flex-none place-items-center rounded-full border border-campo bg-poco',
        'data-[marcado]:border-iris data-[marcado]:bg-iris',
        'data-[marcado]:after:size-[7px] data-[marcado]:after:rounded-full data-[marcado]:after:bg-sobre-iris data-[marcado]:after:content-[""]',
        className,
      )}
    />
  );
}

export const Radio = React.forwardRef<HTMLButtonElement, RadioProps>(
  ({ value, className, disabled, ...props }, ref) => {
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
          'group inline-flex flex-none rounded-full p-0',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
          'disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      >
        <BolinhaDoRadio
          marcado={marcado}
          className="group-hover:border-fg/[.62] group-disabled:border-dashed group-disabled:border-fio-2 group-disabled:bg-transparent group-disabled:hover:border-fio-2"
        />
      </button>
    );
  },
);
Radio.displayName = 'Radio';
