// D-565 (onda 4): as regras do quadro de capa, do lado da tela.
//
// A capa do short é um FRAME dele mesmo — não uma arte montada como a do corte.
// Aquela existe porque o vídeo do corte é deitado; este já nasce 9:16, com o
// palco, a moldura e o fundo do canal, e com o gancho escrito em cima nos
// primeiros segundos.
//
// O que esta tela precisa dizer é uma coisa só: **a vitrine do perfil recorta a
// capa em 3:4**. Um quadro perfeito com o rosto no rodapé vira, na grade, um
// quadro sem rosto — e o operador só descobre depois de publicado.
//
// Os números espelham `backend/app/domain/capa_short.py`, e o teste LÊ aquele
// arquivo para conferir.

/** Espelha `FRACAO_SEGURA` em `backend/app/domain/capa_short.py`. */
export const FRACAO_SEGURA = 1344 / 1920;

/** A faixa perdida em cima (e, igual, embaixo), em fração da altura. */
export const FRACAO_CORTADA = (1 - FRACAO_SEGURA) / 2;

/** Espelha `PASSO_SEG` — o passo do ajuste fino. */
export const PASSO_SEG = 0.1;

/** Passo grosso, para varrer o short rápido. */
export const PASSO_GROSSO_SEG = 1;

export interface Instante {
  seg: number;
  /** O instante cai dentro do gancho? A prévia avisa, porque é capa com texto. */
  noGancho: boolean;
}

/** O instante encaixado no vídeo, com a informação de estar sobre o gancho. */
export function instanteEm(seg: number, duracaoSeg: number, ganchoAteSeg: number): Instante {
  const util = Number.isFinite(duracaoSeg) && duracaoSeg > 0 ? duracaoSeg : 0;
  const encaixado = Math.min(Math.max(Number.isFinite(seg) ? seg : 0, 0), util);
  return {
    seg: Math.round(encaixado * 100) / 100,
    noGancho: ganchoAteSeg > 0 && encaixado < ganchoAteSeg,
  };
}

/**
 * O recado sobre o quadro escolhido.
 *
 * O caso do gancho não é aviso de problema — é o contrário: um quadro com o
 * gancho já traz a promessa escrita, e essa é a melhor capa que um short tem.
 */
export function recadoDoInstante(instante: Instante): string {
  if (instante.noGancho) {
    return 'Este quadro tem o gancho — a capa já sai com a promessa escrita.';
  }
  return 'Quadro sem o gancho: confira se o que aparece se explica sozinho.';
}

/** Posição do instante na régua, de 0 a 1. */
export function posicaoNaRegua(seg: number, duracaoSeg: number): number {
  if (!Number.isFinite(duracaoSeg) || duracaoSeg <= 0) return 0;
  return Math.min(Math.max(seg / duracaoSeg, 0), 1);
}

/** O instante correspondente a um clique na régua. */
export function instanteDaPosicao(fracao: number, duracaoSeg: number): number {
  const util = Number.isFinite(duracaoSeg) && duracaoSeg > 0 ? duracaoSeg : 0;
  return Math.round(Math.min(Math.max(fracao, 0), 1) * util * 100) / 100;
}

/** `mm:ss.d` — o décimo importa, porque o passo fino é de 0,1s. */
export function comSegundos(seg: number): string {
  const total = Math.max(0, seg);
  const min = Math.floor(total / 60);
  const resto = total - min * 60;
  return `${String(min).padStart(2, '0')}:${resto.toFixed(1).padStart(4, '0')}`;
}
