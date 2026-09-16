// D-604: o short como COLAGEM de pedaços do bruto, do lado da tela.
//
// Um short era uma janela única. Agora ele pode ser N fatias descontínuas —
// "de 0 a 30s e depois de 45 a 60s" —, porque o meio não serve e cortar fora é
// exatamente o trabalho.
//
// A ORDEM da lista é a ordem em que toca, e é livre: o operador pode abrir com o
// gancho mais forte mesmo que ele venha depois na live. Nada aqui ordena a lista.
//
// Os números e as regras espelham `backend/app/domain/segmentos_short.py`, porque
// os projetos não compartilham módulo — a mesma situação de `previaLegenda.ts` e
// `ganchoDoShort.ts`, e a mesma defesa: `segmentosDoShort.test.ts` LÊ aquele
// arquivo e compara. Se um lado mudar sozinho, o teste cai em vez de a tela
// mentir sobre o que o render vai fazer.

import type { ShortSugerido } from './shortsApi';

/** Espelha `MAX_SEGMENTOS` — acima disso a colagem deixa de ser um short. */
export const MAX_SEGMENTOS = 12;

/** Uma fatia do bruto, em tempo de BRUTO (o clip já sem os desvios). */
export interface Segmento {
  inicio_seg: number;
  fim_seg: number;
}

/** Um segmento com o instante do SHORT em que ele entra. */
export interface SegmentoNoShort {
  segmento: Segmento;
  /** Onde este pedaço começa, no tempo do short. */
  offsetSeg: number;
  /** Posição na ordem de toque, de 1 em diante — o que a tela mostra. */
  ordem: number;
}

export function duracaoDe(segmento: Segmento): number {
  return Math.round((segmento.fim_seg - segmento.inicio_seg) * 1000) / 1000;
}

/**
 * Os segmentos que o short REALMENTE toca — os dele, ou a janela única.
 *
 * O único lugar onde "lista vazia = a janela de sempre" é decidido. Todo o resto
 * deste módulo passa por aqui, e por isso nenhum componente precisa saber da
 * regra. Espelha `efetivos` do backend.
 */
export function efetivos(short: {
  segmentos?: Segmento[];
  inicio_seg: number;
  fim_seg: number;
}): Segmento[] {
  const proprios = short.segmentos ?? [];
  if (proprios.length > 0) return proprios;
  return [{ inicio_seg: short.inicio_seg, fim_seg: short.fim_seg }];
}

/** O short é uma colagem, ou a janela única de sempre? */
export function temColagem(short: { segmentos?: Segmento[] }): boolean {
  return (short.segmentos?.length ?? 0) > 1;
}

/**
 * Quanto tempo de VÍDEO o short tem — a soma do que toca, e não o span.
 *
 * A pergunta que esta demanda inteira existe para centralizar: com buraco no
 * meio, `fim - inicio` mente para cima. Num limite de 60s do Shorts, mentir para
 * cima é o pior lado.
 */
export function duracaoLiquida(short: {
  segmentos?: Segmento[];
  inicio_seg: number;
  fim_seg: number;
}): number {
  const total = efetivos(short).reduce((soma, s) => soma + duracaoDe(s), 0);
  return Math.round(total * 1000) / 1000;
}

/**
 * Cada segmento com o instante do short em que ele começa.
 *
 * O coração do remapeamento, e o que faz a ordem livre funcionar sem caso
 * especial: o segundo pedaço começa onde o primeiro acabou, seja ele anterior ou
 * posterior no bruto.
 */
export function comOffsets(short: {
  segmentos?: Segmento[];
  inicio_seg: number;
  fim_seg: number;
}): SegmentoNoShort[] {
  let acumulado = 0;
  return efetivos(short).map((segmento, indice) => {
    const item = {
      segmento,
      offsetSeg: Math.round(acumulado * 1000) / 1000,
      ordem: indice + 1,
    };
    acumulado += duracaoDe(segmento);
    return item;
  });
}

/**
 * Onde no SHORT cai um instante do bruto, ou `null` se ele não entra.
 *
 * `null` é resposta comum e correta: o buraco entre dois segmentos é material que
 * o short não tem. É o que faz a prévia esconder a legenda de uma fala que o
 * arquivo não vai conter.
 *
 * Com sobreposição, o primeiro da ordem de toque ganha — é a única resposta
 * estável, e é a que o operador vê ao arrastar o player para trás.
 */
export function noShort(
  segundoNoBruto: number,
  short: { segmentos?: Segmento[]; inicio_seg: number; fim_seg: number },
): number | null {
  for (const { segmento, offsetSeg } of comOffsets(short)) {
    if (segundoNoBruto >= segmento.inicio_seg && segundoNoBruto < segmento.fim_seg) {
      return Math.round((offsetSeg + (segundoNoBruto - segmento.inicio_seg)) * 1000) / 1000;
    }
  }
  return null;
}

/** "2 segmentos · 45s" — o que o card mostra sem abrir a régua. */
export function resumo(short: {
  segmentos?: Segmento[];
  inicio_seg: number;
  fim_seg: number;
}): string {
  const usados = efetivos(short);
  const duracao = `${Math.round(duracaoLiquida(short))}s`;
  return usados.length <= 1 ? duracao : `${usados.length} segmentos · ${duracao}`;
}

/**
 * A lista com um segmento novo no fim, na duração padrão.
 *
 * Entra no FIM da ordem de toque, e não em ordem cronológica: quem marca um
 * pedaço acabou de decidir onde ele entra, e reordenar por conta própria
 * desfaria isso. Reordenar é um gesto separado, nos botões do card.
 */
export function comSegmentoNovo(
  short: ShortSugerido,
  inicioSeg: number,
  fimSeg: number,
): Segmento[] {
  const atuais = efetivos(short);
  return [...atuais, { inicio_seg: inicioSeg, fim_seg: fimSeg }].slice(0, MAX_SEGMENTOS);
}

/**
 * A lista sem o segmento da posição dada — inclusive quando sobra um só.
 *
 * Sobrando um, a lista vai com ele, e NÃO vazia. Parece detalhe e é o contrário:
 * `[]` quer dizer "desfaça a colagem e fique com a janela de agora", e a janela
 * de agora é o ENVELOPE — que ainda cobre o buraco. Remover o 45-60 de um short
 * 0-30 + 45-60 mandando `[]` devolveria o short 0-60, com o vão de volta dentro.
 *
 * Mandando o que sobrou, o backend colapsa: um segmento só vira a janela única
 * com as bordas DELE (`atualizar_decisao`).
 */
export function semOSegmento(short: ShortSugerido, indice: number): Segmento[] {
  return efetivos(short).filter((_, i) => i !== indice);
}

/** A lista com o segmento movido uma casa na ordem de toque. */
export function comSegmentoMovido(
  short: ShortSugerido,
  indice: number,
  direcao: -1 | 1,
): Segmento[] {
  const atuais = [...efetivos(short)];
  const destino = indice + direcao;
  if (destino < 0 || destino >= atuais.length) return atuais;
  [atuais[indice], atuais[destino]] = [atuais[destino], atuais[indice]];
  return atuais;
}
