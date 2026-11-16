import * as React from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// D-1117 · Segmented: escolha de UM entre poucos, num trilho de pílula (Radix
// Toggle Group → `role=radiogroup`/`radio`). O item escolhido sobe para vidro e
// leva VISTO. Diferente do Chip (que liga e desliga), aqui sempre há um escolhido:
// clicar no que já está escolhido não o desmarca.

export interface OpcaoDoSegmented<V extends string = string> {
  valor: V;
  rotulo: React.ReactNode;
  desabilitado?: boolean;
}

export interface SegmentedProps<V extends string = string> {
  value: V;
  onValueChange: (valor: V) => void;
  opcoes: readonly OpcaoDoSegmented<V>[];
  /** Obrigatório: o grupo precisa de nome para o leitor de tela. */
  'aria-label': string;
  /** Ocupa a largura toda, itens do mesmo tamanho. */
  cheio?: boolean;
  className?: string;
}

export function Segmented<V extends string = string>({
  value,
  onValueChange,
  opcoes,
  cheio = false,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<V>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(v) => {
        if (v) onValueChange(v as V);
      }}
      className={cn(
        'gap-0.5 rounded-pilula border border-fio bg-poco p-[3px]',
        cheio ? 'flex' : 'inline-flex',
        className,
      )}
    >
      {opcoes.map((o) => (
        <ToggleGroup.Item
          key={o.valor}
          value={o.valor}
          disabled={o.desabilitado}
          className={cn(
            'inline-flex h-[30px] select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-pilula border border-transparent bg-transparent px-3.5 text-[12px] font-semibold leading-none text-fg-3 transition-colors duration-150',
            cheio && 'flex-1',
            'hover:text-fg',
            'data-[state=on]:border-fio-2 data-[state=on]:bg-vidro-3 data-[state=on]:text-fg data-[state=on]:shadow-topo',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco',
            'disabled:cursor-not-allowed disabled:text-fg-off disabled:hover:text-fg-off',
            'motion-reduce:transition-none',
          )}
        >
          {o.valor === value ? (
            <Check aria-hidden data-marca="visto" strokeWidth={2.4} className="size-3 flex-none text-iris" />
          ) : null}
          {o.rotulo}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
