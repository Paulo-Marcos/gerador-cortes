import type { Desvio } from '@/types/models';
import { janelaDo, legendaEm } from './legendaDoTrecho';

// D-1091 (E3 da D-1082): o aviso do preview com o cursor num trecho que sai,
// "SAI · 17 s · SILÊNCIO", a justificativa e o ponto da emenda.
//
// A justificativa e o rótulo são os da legenda da D-511: o trecho sob o cursor.
// A duração e a emenda são as do BLOCO que sai, os trechos sobrepostos fundidos,
// porque é assim que o render corta: um trecho dentro de outro conta uma vez, e
// o vídeo só volta depois do último que encosta.

export interface AvisoDoTrecho {
  titulo: string;
  justificativa: string;
  /** Onde o bloco que sai começa: até aqui o vídeo toca. */
  inicio: number;
  /** A emenda: onde o vídeo volta depois do bloco. */
  emenda: number;
}

/** O bloco que sai (os trechos que se tocam, fundidos) que contém o instante. */
export function blocoQueSaiEm(desvios: Desvio[], segundo: number): { inicio: number; fim: number } | null {
  const janelas = desvios
    .map(janelaDo)
    .filter((j) => j.fim > j.inicio)
    .sort((a, b) => a.inicio - b.inicio);
  let bloco: { inicio: number; fim: number } | null = null;
  for (const janela of janelas) {
    if (bloco && janela.inicio <= bloco.fim) {
      bloco.fim = Math.max(bloco.fim, janela.fim);
      continue;
    }
    if (bloco && segundo >= bloco.inicio && segundo < bloco.fim) return bloco;
    bloco = { ...janela };
  }
  return bloco && segundo >= bloco.inicio && segundo < bloco.fim ? bloco : null;
}

/** "0,8 s", "17 s", "1:56": a escala que se lê de relance. */
export function formatarDuracao(segundos: number): string {
  if (segundos < 10) return `${segundos.toFixed(1).replace('.', ',')} s`;
  if (segundos < 60) return `${Math.round(segundos)} s`;
  const total = Math.round(segundos);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function avisoDoTrechoEm(desvios: Desvio[], segundo: number): AvisoDoTrecho | null {
  const legenda = legendaEm(desvios, segundo);
  const bloco = blocoQueSaiEm(desvios, segundo);
  if (!legenda || !bloco) return null;
  return {
    titulo: ['sai', formatarDuracao(bloco.fim - bloco.inicio), legenda.rotulo].filter(Boolean).join(' · '),
    justificativa: legenda.texto,
    inicio: bloco.inicio,
    emenda: bloco.fim,
  };
}
