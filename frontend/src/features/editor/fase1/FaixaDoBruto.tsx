import type { ReactNode } from 'react';
import { Panel, type PanelProps } from 'react-resizable-panels';
import type { Desvio } from '@/types/models';
import { oQueOBrutoTem } from './oQueOBrutoTem';

// D-1094 (E4 da D-1082): abaixo da linha do tempo, o que o bruto vai ter quando
// for gerado: quanto fica, quanto sai e a sincronia do áudio. Só leitura: a
// sincronia se ajusta na pergunta do som (D-1095), e o valor aqui é o atual,
// ainda não salvo, para a faixa acompanhar o ajuste.

type CorteDaFaixa = { inicio_seg: number; fim_seg: number; desvios?: Desvio[] | null };

interface Props {
  corte: CorteDaFaixa;
  audioOffsetMs: number;
}

export function FaixaDoBruto({ corte, audioOffsetMs }: Props) {
  const { fica, bruto, sai, sincronia } = oQueOBrutoTem(corte, audioOffsetMs);
  return (
    <section
      aria-label="O bruto vai ter"
      className="mt-2 flex flex-none flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-3.5 py-2 text-[13px] text-[var(--wb-text)]"
    >
      <h3 className="m-0 font-code text-[11px] font-bold tracking-[0.1em] text-[var(--wb-text-mute)]">
        O BRUTO VAI TER
      </h3>
      <span>
        <strong className="font-semibold">fica {fica}</strong> de {bruto}
      </span>
      <span>{sai}</span>
      <span>{sincronia}</span>
    </section>
  );
}

/**
 * O painel da linha do tempo, com a faixa embaixo. A faixa fica fora da
 * TimelinePanel (acima do teto de tamanho), e a linha do tempo encolhe para
 * dar lugar a ela dentro do mesmo painel redimensionável.
 */
export function PainelComFaixaDoBruto({
  corte,
  audioOffsetMs,
  children,
  ...painel
}: PanelProps & Props & { children: ReactNode }) {
  return (
    <Panel {...painel}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">{children}</div>
        <FaixaDoBruto corte={corte} audioOffsetMs={audioOffsetMs} />
      </div>
    </Panel>
  );
}
