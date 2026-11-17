import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1121 (E-069 H-11a) · Progresso: a barra de um trabalho em andamento (render, upload).
//
// Pílula `poco` de 6 px com o enchimento em `info` ("em curso", DIRECAO §5). NUNCA no feixe:
// o feixe é "onde estou" e a ação única; progresso é leitura de estado (§3.1, §4.2).
// O percentual vai ao lado, em mono: a barra sozinha não diz quanto falta.
// `--p` (0 a 100) é geometria de execução, a única coisa que muda por render; a cor, a
// altura e o raio são classe. (`--cc-info` direto: o `bg-info` do Tailwind ainda é o antigo.)

export interface ProgressoProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 0 a 100. Fora disso é aparado: um render que reporta 104% não estoura a barra. */
  valor: number;
  /** O que está andando ("Renderização do corte 3"): leitor de tela não vê a barra. */
  rotulo: string;
  /** O "64%" em mono ao lado. Ligado por padrão; a barra sem o número é só decoração. */
  mostrarValor?: boolean;
}

export function percentualValido(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round(Math.min(100, Math.max(0, valor)));
}

export const Progresso = React.forwardRef<HTMLDivElement, ProgressoProps>(function Progresso(
  { valor, rotulo, mostrarValor = true, className, ...props },
  ref,
) {
  const pct = percentualValido(valor);
  const geometria = { '--p': pct } as React.CSSProperties;
  return (
    <div ref={ref} className={cn('flex min-w-0 items-center gap-2.5', className)} {...props}>
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={geometria}
        className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-pilula bg-poco"
      >
        <span
          aria-hidden
          data-parte="enchimento"
          className="absolute inset-y-0 left-0 w-[calc(var(--p)*1%)] rounded-pilula bg-[var(--cc-info)]"
        />
      </div>
      {mostrarValor && (
        <span data-parte="percentual" className="num min-w-[3ch] flex-none text-right text-fg-3">
          {pct}%
        </span>
      )}
    </div>
  );
});
