import * as React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

// D-1120 (E-069 H-10) · KPI: um número que o operador quer ler de relance.
//
// REGRA: sem dado NÃO é zero. Zero é uma medida ("0 cortes publicados"); falta de dado é
// outra coisa ("não sei"). Por isso `valor` ausente (`undefined` ou `null`) mostra
// "Sem dados" em peso leve e `fg-3`, com o MOTIVO embaixo ("O canal ainda não
// publicou"). `valor={0}` continua sendo um zero de verdade. O cartão é vidro de raio 20,
// sem fio de luz (§3.1) e sem feixe.

interface KpiBase extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  rotulo: string;
  /** Ícone do inventário colado ao rótulo (DIRECAO §7.8: "rótulo com ícone"). */
  icone?: React.ComponentProps<typeof Icon>['name'];
  /** "min", "%", "views"… colado ao valor, menor. */
  unidade?: string;
  /** Linha de contexto sob o valor ("+12% sobre a semana"). */
  detalhe?: string;
}

/**
 * Ou há valor, ou há MOTIVO: sem valor o tipo exige dizer por que ("O YouTube ainda não liberou…").
 * `0` é um valor, um zero medido. O número sai formatado em pt-BR ("6,4", "48.210").
 */
export type KpiProps = KpiBase &
  ({ valor: number | string; motivo?: string } | { valor?: null | undefined; motivo: string });

const NUMERO_PT_BR = new Intl.NumberFormat('pt-BR');

export const Kpi = React.forwardRef<HTMLDivElement, KpiProps>(function Kpi(
  { rotulo, icone, valor, unidade, motivo, detalhe, className, ...props },
  ref,
) {
  const semDado = valor === undefined || valor === null || valor === '';
  const exibido = typeof valor === 'number' ? NUMERO_PT_BR.format(valor) : valor;
  return (
    <div
      ref={ref}
      data-semdados={semDado || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-cartao border border-fio bg-vidro px-5 py-[18px] shadow-topo',
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-1.5 text-micro text-fg-3">
        {icone && <Icon name={icone} size={14} />}
        {rotulo}
      </span>
      {semDado ? (
        <>
          <span className="text-display font-light text-fg-3">Sem dados</span>
          <span className="text-pequeno text-fg-3">{motivo}</span>
        </>
      ) : (
        <>
          <span className="flex items-baseline gap-1.5">
            <span className="text-display font-extrabold tabular-nums text-fg">{exibido}</span>
            {unidade && <span className="text-pequeno text-fg-3">{unidade}</span>}
          </span>
          {detalhe && <span className="text-pequeno text-fg-2">{detalhe}</span>}
        </>
      )}
    </div>
  );
});
