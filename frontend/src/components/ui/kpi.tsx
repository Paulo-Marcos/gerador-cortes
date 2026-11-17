import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1120 (E-069 H-10) · KPI: um número que o operador quer ler de relance.
//
// REGRA: sem dado NÃO é zero. Zero é uma medida ("0 cortes publicados"); falta de dado é
// outra coisa ("não sei"). Por isso `valor` ausente (`undefined` ou `null`) mostra
// "Sem dados" em peso leve e `fg-3`, com o MOTIVO embaixo ("O canal ainda não
// publicou"). `valor={0}` continua sendo um zero de verdade. O cartão é vidro de raio 20,
// sem fio de luz (§3.1) e sem feixe.

export interface KpiProps extends React.HTMLAttributes<HTMLDivElement> {
  rotulo: string;
  /** Ausente = sem dado. `0` é um zero real. */
  valor?: number | string | null;
  /** "min", "%", "views"… colado ao valor, menor. */
  unidade?: string;
  /** Por que não há dado, quando `valor` falta. Passe sempre: o texto padrão só diz que não há medição, não o que fazer. */
  motivo?: string;
  /** Linha de contexto sob o valor ("+12% sobre a semana"). */
  detalhe?: string;
}

export const Kpi = React.forwardRef<HTMLDivElement, KpiProps>(function Kpi(
  { rotulo, valor, unidade, motivo, detalhe, className, ...props },
  ref,
) {
  const semDado = valor === undefined || valor === null || valor === '';
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
      <span className="text-micro text-fg-3">{rotulo}</span>
      {semDado ? (
        <>
          <span className="text-display font-light text-fg-3">Sem dados</span>
          <span className="text-pequeno text-fg-3">{motivo ?? 'Ainda não há medição.'}</span>
        </>
      ) : (
        <>
          <span className="flex items-baseline gap-1.5">
            <span className="text-display font-extrabold tabular-nums text-fg">{valor}</span>
            {unidade && <span className="text-pequeno text-fg-3">{unidade}</span>}
          </span>
          {detalhe && <span className="text-pequeno text-fg-2">{detalhe}</span>}
        </>
      )}
    </div>
  );
});
