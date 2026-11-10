import type { Desvio } from '@/types/models';
import { formatarDuracao } from '@/lib/utils';
import { medirFicaESai } from '../timeUtils';
import { classificarTrechos } from './origemDaBorda';

// D-1094 (E4 da D-1082): o que a faixa "O bruto vai ter" diz do corte.
//
// Nenhuma conta nova: o fica e o sai são os do resumo da etapa (medirFicaESai,
// D-1090) e o "dentro de outro" é a classe da linha do tempo (classificarTrechos,
// D-1091). Assim a faixa, a trilha e a onda nunca dão números diferentes.

export interface DescricaoDoBruto {
  /** "17:43" */
  fica: string;
  /** "20:11" */
  bruto: string;
  /** "sai 2:28 em 3 trechos (1 dentro de outro)" ou "nada sai". */
  sai: string;
  /** "sincronia do áudio +40 ms" */
  sincronia: string;
}

function contarTrechos(desvios: Desvio[]): string {
  const total = desvios.length;
  const dentro = classificarTrechos(desvios).filter((classe) => classe === 'dentro').length;
  const trechos = `${total} ${total === 1 ? 'trecho' : 'trechos'}`;
  if (dentro === 0) return trechos;
  return `${trechos} (${dentro} dentro de ${dentro === 1 ? 'outro' : 'outros'})`;
}

/** O sinal da faixa O bruto vai ter e do cabeçalho da pergunta do som: +40, 0, -40. */
export function formatarComSinal(ms: number): string {
  return ms > 0 ? `+${ms}` : String(ms);
}

export function descreverOBruto(
  corte: { inicio_seg: number; fim_seg: number; desvios?: Desvio[] | null },
  audioOffsetMs: number,
): DescricaoDoBruto {
  const desvios = corte.desvios ?? [];
  const { brutoSeg, ficaSeg, saiSeg } = medirFicaESai(corte.inicio_seg, corte.fim_seg, desvios);
  return {
    fica: formatarDuracao(ficaSeg),
    bruto: formatarDuracao(brutoSeg),
    sai: saiSeg > 0 ? `sai ${formatarDuracao(saiSeg)} em ${contarTrechos(desvios)}` : 'nada sai',
    sincronia: `sincronia do áudio ${formatarComSinal(audioOffsetMs)} ms`,
  };
}
