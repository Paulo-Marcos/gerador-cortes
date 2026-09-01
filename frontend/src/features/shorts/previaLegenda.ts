import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import type { PalavraTranscrita } from './shortsApi';

// D-479: a legenda que vai ser QUEIMADA no short, mostrada antes do render.
//
// 85% das visualizações de short acontecem no mudo — a legenda não é
// acessibilidade, é o conteúdo. Aprovar um candidato sem vê-la é julgar metade
// do produto.
//
// A regra que rege este arquivo: a prévia usa a MESMA função de agrupamento que
// o render (`createTikTokStyleCaptions`, do pacote real), não uma imitação.
// Reimplementar o agrupamento aqui criaria o pior tipo de bug — a tela mostra
// uma quebra de linha, o arquivo sai com outra, e nada quebra para avisar.
//
// Os dois números abaixo ainda são cópias de `LegendaShort.tsx` do renderer,
// porque os projetos não compartilham módulo. O teste `previaLegenda.test.ts`
// LÊ aquele arquivo e compara — se um lado mudar sozinho, o teste cai.

/** Espelha `AGRUPAMENTO_MS` em `video-renderer/src/cenas-shorts/LegendaShort.tsx`. */
export const AGRUPAMENTO_MS = 1200;

/** Espelha `SAFE_ZONE` em `video-renderer/src/cenas-shorts/LegendaShort.tsx`. */
export const SAFE_ZONE = 0.18;

export interface TokenLegenda {
  texto: string;
  deSeg: number;
  ateSeg: number;
}

export interface PaginaLegenda {
  inicioSeg: number;
  fimSeg: number;
  tokens: TokenLegenda[];
}

/**
 * Converte as palavras do bruto em `Caption`, recortadas e rebaseadas ao short.
 *
 * Espelha `services/legendas_short.para_captions` + `domain/transcricao_fiel.recortar`:
 * milissegundos, espaço à esquerda em toda palavra menos a primeira (sem ele o
 * Remotion concatena "ninguemtecontaisso"), e o zero do short como origem.
 */
export function captionsDoTrecho(
  palavras: PalavraTranscrita[],
  inicioSeg: number,
  fimSeg: number,
): Caption[] {
  const dentro = palavras.filter((p) => p.inicio_seg >= inicioSeg && p.inicio_seg < fimSeg);

  return dentro.map((palavra, indice) => {
    const inicioMs = Math.round(Math.max(0, palavra.inicio_seg - inicioSeg) * 1000);
    const fimMs = Math.round((Math.min(palavra.fim_seg, fimSeg) - inicioSeg) * 1000);
    return {
      text: indice === 0 ? palavra.texto : ` ${palavra.texto}`,
      startMs: inicioMs,
      endMs: fimMs,
      timestampMs: Math.round((inicioMs + fimMs) / 2),
      confidence: null,
    };
  });
}

/** As páginas da legenda, na mesma quebra que o render vai produzir. */
export function paginasDoTrecho(
  palavras: PalavraTranscrita[],
  inicioSeg: number,
  fimSeg: number,
): PaginaLegenda[] {
  const captions = captionsDoTrecho(palavras, inicioSeg, fimSeg);
  if (captions.length === 0) return [];

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: AGRUPAMENTO_MS,
  });

  return pages.map((pagina) => ({
    inicioSeg: pagina.startMs / 1000,
    fimSeg: (pagina.startMs + pagina.durationMs) / 1000,
    tokens: pagina.tokens.map((token) => ({
      texto: token.text,
      deSeg: token.fromMs / 1000,
      ateSeg: token.toMs / 1000,
    })),
  }));
}

/**
 * A página visível num instante do SHORT (não do bruto).
 *
 * Devolve `null` fora de qualquer página — silêncio é legenda em branco, e
 * inventar texto ali seria a prévia mentindo sobre o arquivo.
 */
export function paginaEm(paginas: PaginaLegenda[], segundoNoShort: number): PaginaLegenda | null {
  return (
    paginas.find((p) => segundoNoShort >= p.inicioSeg && segundoNoShort < p.fimSeg) ?? null
  );
}
