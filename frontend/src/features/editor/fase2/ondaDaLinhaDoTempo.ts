import type { Desvio, WaveformPeaksResponse } from '@/types/models';
import { limitar } from '@/lib/limitar';
import { hmsParaSeg } from '../timeUtils';

// D-1164 (E-069 H-18) · a pista de áudio da linha do tempo da Pós: transforma os picos
// do bruto na onda do corte líquido. Sai do `SceneTimeline` para ele ficar só com a
// tela; a regra é a mesma de antes (os trechos que saem do corte somem da onda).

/** Quantas barras a pista de áudio desenha. */
export const BARRAS_DA_ONDA = 220;

interface TrechoQueSai {
  start: number;
  end: number;
}

function trechosQueSaem(
  desvios: Desvio[] | undefined,
  inicioDoBruto: number | undefined,
  fimDoBruto: number | undefined,
): TrechoQueSai[] {
  if (!desvios?.length || inicioDoBruto == null || fimDoBruto == null || fimDoBruto <= inicioDoBruto) return [];

  return desvios
    .map((desvio) => {
      const start = limitar(hmsParaSeg(desvio.inicio_hms), inicioDoBruto, fimDoBruto);
      const end = limitar(hmsParaSeg(desvio.fim_hms), inicioDoBruto, fimDoBruto);
      return end > start ? { start, end } : null;
    })
    .filter((trecho): trecho is TrechoQueSai => Boolean(trecho))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function tempoNoBruto(
  tempoNoCorte: number,
  inicioDoBruto: number | undefined,
  fimDoBruto: number | undefined,
  saem: TrechoQueSai[],
): number | null {
  if (inicioDoBruto == null || fimDoBruto == null || fimDoBruto <= inicioDoBruto) return null;

  let tempo = inicioDoBruto + Math.max(0, tempoNoCorte);
  let jaSaiu = 0;
  for (const trecho of saem) {
    const inicioNoCorte = trecho.start - inicioDoBruto - jaSaiu;
    if (tempoNoCorte < inicioNoCorte) break;
    const duracao = trecho.end - trecho.start;
    tempo += duracao;
    jaSaiu += duracao;
  }

  return limitar(tempo, inicioDoBruto, fimDoBruto);
}

function picoNoBruto(onda: WaveformPeaksResponse, tempo: number): number {
  const relativo = tempo - onda.offset_sec;
  if (relativo < 0 || relativo > onda.duration_sec || onda.peaks.length === 0) return 0;
  const indice = limitar(
    Math.floor((relativo / onda.duration_sec) * onda.peaks.length),
    0,
    onda.peaks.length - 1,
  );
  return Math.abs(onda.peaks[indice] ?? 0);
}

/** As barras (0 a 1) da onda do corte líquido, uma por fatia da duração. */
export function barrasDaOnda(
  onda: WaveformPeaksResponse | null,
  duracao: number,
  inicioDoBruto: number | undefined,
  fimDoBruto: number | undefined,
  desvios: Desvio[] | undefined,
): number[] {
  if (!onda || duracao <= 0) return [];

  const saem = trechosQueSaem(desvios, inicioDoBruto, fimDoBruto);
  return Array.from({ length: BARRAS_DA_ONDA }, (_, idx) => {
    const tempoNoCorte = ((idx + 0.5) / BARRAS_DA_ONDA) * duracao;
    const tempo = tempoNoBruto(tempoNoCorte, inicioDoBruto, fimDoBruto, saem);
    return tempo == null ? 0 : picoNoBruto(onda, tempo);
  });
}
