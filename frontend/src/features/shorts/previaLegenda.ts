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

// D-605: ONDE a legenda senta, e que largura ela ocupa.
//
// Até aqui o lugar era lei do código: base no alto da safe zone, centralizada,
// 80% de largura. O relato do operador foi direto — "a depender do Palco, ela
// fica em cima da pessoa". Quem decide onde a pessoa aparece no vertical é o
// arranjo do palco, então um ponto fixo acerta num arranjo e erra no seguinte,
// dentro do MESMO corte.
//
// `x` é o CENTRO da caixa e `y` é a BASE dela, contada do topo do quadro. Base e
// não topo: a legenda vira duas ou três linhas várias vezes por short, e
// ancorada pela base ela cresce para CIMA — a última linha nunca se move, que é
// o que o `bottom:` do renderer sempre fez. O gancho ancora pelo topo pelo
// motivo simétrico (`ganchoDoShort.ts`).
//
// Espelham `backend/app/domain/legenda_short.py`, e o
// `previaLegenda.test.ts` LÊ aquele arquivo e compara — se um lado mudar
// sozinho, o teste cai em vez de a prévia mentir sobre o que o render vai fazer.

/** Espelha `POSICAO_X_PADRAO`. */
export const POSICAO_X_PADRAO = 50.0;

/** Espelha `POSICAO_Y_PADRAO` — a base no alto da safe zone, o lugar de sempre. */
export const POSICAO_Y_PADRAO = 100 - SAFE_ZONE * 100;

/** Espelha `LARGURA_PADRAO` — os 80% que o código tinha embutidos. */
export const LARGURA_PADRAO = 80.0;

/** Espelha `POSICAO_X_MIN`. */
export const POSICAO_X_MIN = 10.0;

/** Espelha `POSICAO_X_MAX`. */
export const POSICAO_X_MAX = 90.0;

/** Espelha `POSICAO_Y_MIN`. */
export const POSICAO_Y_MIN = 12.0;

/** Espelha `POSICAO_Y_MAX`. */
export const POSICAO_Y_MAX = 99.0;

/** Espelha `LARGURA_MIN`. */
export const LARGURA_MIN = 40.0;

/** Espelha `LARGURA_MAX`. */
export const LARGURA_MAX = 100.0;

/** Passo da largura por clique, em pontos percentuais. */
export const LARGURA_PASSO = 4;

/** Onde a caixa da legenda fica, em % do quadro. 0 em qualquer campo = herda. */
export interface LugarDaLegenda {
  x: number;
  y: number;
  largura: number;
}

function naFaixa(valor: unknown, padrao: number, minimo: number, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return padrao;
  return Math.round(Math.min(Math.max(valor, minimo), maximo) * 100) / 100;
}

/**
 * O lugar que vai para a tela: o do trecho, o do palco do corte, ou o de sempre.
 *
 * Resolve a cascata inteira num lugar só — a mesma regra que
 * `com_palco_do_corte` + `legenda_short.para_payload` aplicam no backend. Ter as
 * duas pontas concordando é o que faz a prévia valer como prova.
 */
export function lugarEfetivo(
  proprio: { x?: number | null; y?: number | null; largura?: number | null } | null | undefined,
  padrao: { x?: number | null; y?: number | null; largura?: number | null } | null | undefined,
): LugarDaLegenda {
  return {
    x: naFaixa(proprio?.x || padrao?.x, POSICAO_X_PADRAO, POSICAO_X_MIN, POSICAO_X_MAX),
    y: naFaixa(proprio?.y || padrao?.y, POSICAO_Y_PADRAO, POSICAO_Y_MIN, POSICAO_Y_MAX),
    largura: naFaixa(proprio?.largura || padrao?.largura, LARGURA_PADRAO, LARGURA_MIN, LARGURA_MAX),
  };
}

function grudado(valor: number, minimo: number, maximo: number): number {
  return Math.round(Math.min(Math.max(valor, minimo), maximo) * 100) / 100;
}

/**
 * O lugar da legenda depois de um arraste, já encaixado na faixa útil.
 *
 * Corta pelo MÍNIMO, e não pelo `naFaixa` da cascata. A diferença importa: para
 * a cascata, zero é "não decidi" e vira o padrão; num arraste isso seria a
 * legenda pulando de volta para o rodapé na mão do operador, justamente quando
 * ele a puxa para cima. Aqui o gesto sempre manda — o que ele não pode é jogar o
 * texto para fora do quadro.
 */
export function lugarArrastado(
  lugar: LugarDaLegenda,
  dxPct: number,
  dyPct: number,
): LugarDaLegenda {
  return {
    ...lugar,
    x: grudado(lugar.x + dxPct, POSICAO_X_MIN, POSICAO_X_MAX),
    y: grudado(lugar.y + dyPct, POSICAO_Y_MIN, POSICAO_Y_MAX),
  };
}

/**
 * O lugar que a prévia desenha, a partir do plano e do short.
 *
 * O PLANO vem primeiro porque é ele que já traz a cascata resolvida pelo backend
 * (o valor do trecho, senão o do palco padrão do corte). O short entra como
 * fallback de enquanto o plano não chegou — sem ele, a legenda pularia do rodapé
 * fixo para o lugar certo no meio do primeiro quadro.
 *
 * Um atalho para não repetir a montagem dos dois objetos em cada prévia: são
 * quatro chamadas, e a quinta é a que erraria a ordem.
 */
export function lugarDaLegenda(
  doPlano: { x?: number; y?: number; largura?: number } | null | undefined,
  doShort:
    | { legenda_x?: number; legenda_y?: number; legenda_largura?: number }
    | null
    | undefined,
): LugarDaLegenda {
  return lugarEfetivo(doPlano, {
    x: doShort?.legenda_x,
    y: doShort?.legenda_y,
    largura: doShort?.legenda_largura,
  });
}

/**
 * O trecho já decidiu onde a legenda senta, em vez de herdar do palco do corte?
 *
 * Zero é a herança, então basta um campo preenchido. Espelha o trecho novo de
 * `palco_shorts._tem_palco_proprio`.
 */
export function temLugarProprio(short: {
  legenda_x?: number | null;
  legenda_y?: number | null;
  legenda_largura?: number | null;
}): boolean {
  return Boolean(
    (short.legenda_x ?? 0) > 0 ||
      (short.legenda_y ?? 0) > 0 ||
      (short.legenda_largura ?? 0) > 0,
  );
}

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

/**
 * D-604: os captions de uma COLAGEM — N janelas, cada uma no seu lugar.
 *
 * Um short pode ser feito de pedaços descontínuos do bruto, e a janela
 * `[inicio, fim]` cobre o vão entre eles. Sem recortar por segmento, a prévia
 * mostraria a fala do BURACO — o material que o operador tirou fora — por cima de
 * um vídeo que pulou. Espelha `transcricao_fiel.recortar_varios` do backend.
 *
 * A ordem é a das janelas (o short pode abrir com o pedaço que vem depois na
 * live); a saída sai ordenada pelo tempo do short, que é o único que a legenda
 * conhece — fora de ordem, o agrupamento em páginas montaria frases embaralhadas.
 */
export function captionsDaColagem(
  palavras: PalavraTranscrita[],
  janelas: { inicio: number; fim: number; offset: number }[],
): Caption[] {
  const todos = janelas.flatMap(({ inicio, fim, offset }) =>
    captionsDoTrecho(palavras, inicio, fim).map((caption) => ({
      ...caption,
      startMs: caption.startMs + Math.round(offset * 1000),
      endMs: caption.endMs + Math.round(offset * 1000),
      // `timestampMs` é nulável no tipo do pacote, e `captionsDoTrecho` sempre o
      // preenche — mas somar num `null` daria `NaN` em silêncio se isso mudar.
      timestampMs:
        caption.timestampMs === null ? null : caption.timestampMs + Math.round(offset * 1000),
    })),
  );
  return todos.sort((a, b) => a.startMs - b.startMs);
}

/** As páginas da legenda, na mesma quebra que o render vai produzir. */
export function paginasDoTrecho(
  palavras: PalavraTranscrita[],
  inicioSeg: number,
  fimSeg: number,
  /**
   * D-604: as janelas da colagem, quando há. Ausente = a janela única, que é o
   * caso normal e se comporta exatamente como antes.
   */
  janelas?: { inicio: number; fim: number; offset: number }[],
): PaginaLegenda[] {
  const captions = janelas?.length
    ? captionsDaColagem(palavras, janelas)
    : captionsDoTrecho(palavras, inicioSeg, fimSeg);
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
