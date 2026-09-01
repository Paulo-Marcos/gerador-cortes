// D-475: onde a janela 9:16 cai sobre o vídeo 16:9.
//
// A tela mostrava o bruto inteiro e um número solto ("50%"). Quem cura não tinha
// como saber o que ia ser cortado — e o número não se explicava sozinho. Esta é
// a conta que transforma o `foco_efetivo` numa janela desenhável por cima do
// player.
//
// Espelha `domain/formato_video.calcular_recorte` do backend, mas em FRAÇÃO em
// vez de pixel: o player tem largura variável, e o que importa aqui é a
// proporção. As duas contas precisam concordar — se um dia divergirem, o
// operador aprova um enquadramento e recebe outro no arquivo.

/** 9:16 — o formato de Shorts, Reels e TikTok. */
const ASPECTO_VERTICAL = 9 / 16;

export interface JanelaEnquadramento {
  /** Distância da borda esquerda, em % da largura do vídeo. */
  esquerdaPct: number;
  /** Largura da janela, em % da largura do vídeo. */
  larguraPct: number;
}

/**
 * A janela vertical dentro de um vídeo de `largura` x `altura`.
 *
 * `focoX` (0 a 1) é o centro pretendido na horizontal. A janela nunca sai do
 * quadro: pedir foco na borda encosta na borda, o mesmo comportamento que o
 * backend aplica ao montar o `crop` do ffmpeg.
 *
 * Vídeo já vertical (ou mais estreito que 9:16) devolve a largura inteira — não
 * há o que recortar, e mostrar máscara ali seria mentira.
 */
export function janelaVertical(
  largura: number,
  altura: number,
  focoX: number,
): JanelaEnquadramento {
  if (!(largura > 0) || !(altura > 0)) return { esquerdaPct: 0, larguraPct: 100 };

  const larguraJanela = Math.min(largura, altura * ASPECTO_VERTICAL);
  const fracao = larguraJanela / largura;
  if (fracao >= 1) return { esquerdaPct: 0, larguraPct: 100 };

  const centro = limitar(focoX, 0, 1);
  const esquerda = limitar(centro - fracao / 2, 0, 1 - fracao);

  return {
    esquerdaPct: arredondar(esquerda * 100),
    larguraPct: arredondar(fracao * 100),
  };
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, maximo));
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
