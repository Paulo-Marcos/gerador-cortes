// D-478: a matemática da faixa de recorte do short.
//
// A curadoria só movia as bordas pelos botões "início aqui"/"fim aqui", que
// pedem para posicionar o player ANTES de cada ajuste. Funciona, mas obriga o
// operador a fazer a conta de cabeça: onde este candidato cai na live? sobrou
// espaço antes dele? Uma faixa desenhada responde as duas de graça.
//
// Aqui mora só a conta — pixel ↔ segundo, e o que um arraste pode fazer. O
// componente cuida do pointer e do desenho; a persistência é do PATCH.
//
// SOBRE OS LIMITES: o backend valida as bordas contra o BRUTO, e de propósito
// NÃO aplica a faixa de 15-90s numa edição manual — ela existe para disciplinar
// a IA, e quem assistiu ao trecho tem o direito de discordar dela
// (`services/shorts.atualizar_short`). O arraste segue a mesma regra: trava no
// arquivo, avisa sobre a faixa, e deixa o humano decidir.

/** Faixa recomendada, espelhando `domain/shorts.FaixaShort`. Aviso, não trava. */
export const DURACAO_RECOMENDADA = { minSeg: 15, maxSeg: 90 } as const;

/**
 * Menor short que faz sentido arrastar.
 *
 * O backend só recusa `fim <= inicio`, então um arraste podia produzir um short
 * de 30 milissegundos: aceito pela API e inútil na tela, porque as duas alças
 * ficariam empilhadas e não haveria como separá-las de novo.
 */
export const DURACAO_MINIMA_SEG = 1;

export type Borda = 'inicio' | 'fim';

export interface Bordas {
  inicio: number;
  fim: number;
}

/**
 * O segundo sob o cursor, dado o retângulo da faixa.
 *
 * Clique fora do retângulo (acontece durante o arraste, quando o ponteiro sai
 * da faixa) devolve a borda mais próxima em vez de um valor fora do vídeo.
 *
 * @param clientX posição do ponteiro, em coordenadas de viewport
 * @param faixa retângulo da faixa, de `getBoundingClientRect()`
 * @param duracaoSeg duração do bruto
 */
export function segundoNoPonteiro(
  clientX: number,
  faixa: { left: number; width: number },
  duracaoSeg: number,
): number {
  if (!(faixa.width > 0) || !(duracaoSeg > 0)) return 0;
  const fracao = limitar((clientX - faixa.left) / faixa.width, 0, 1);
  return fracao * duracaoSeg;
}

/** Onde um instante cai na faixa, em % da largura. */
export function posicaoPct(segundos: number, duracaoSeg: number): number {
  if (!(duracaoSeg > 0)) return 0;
  return limitar((segundos / duracaoSeg) * 100, 0, 100);
}

/**
 * As bordas depois de arrastar uma delas até `segundos`.
 *
 * A borda arrastada nunca atravessa a outra: empurrá-la além do limite a
 * encosta em `DURACAO_MINIMA_SEG` de distância. Isso é o que impede as duas
 * alças de se empilharem — depois de empilhadas, não haveria como pegar uma
 * sem pegar a outra.
 */
export function arrastar(
  bordas: Bordas,
  borda: Borda,
  segundos: number,
  duracaoSeg: number,
): Bordas {
  const teto = duracaoSeg > 0 ? duracaoSeg : Math.max(bordas.fim, segundos);
  const alvo = limitar(segundos, 0, teto);

  if (borda === 'inicio') {
    return { inicio: Math.min(alvo, bordas.fim - DURACAO_MINIMA_SEG), fim: bordas.fim };
  }
  return { inicio: bordas.inicio, fim: Math.max(alvo, bordas.inicio + DURACAO_MINIMA_SEG) };
}

/** `true` quando a duração saiu da faixa que as plataformas premiam. */
export function foraDaFaixaRecomendada(duracaoSeg: number): boolean {
  return duracaoSeg < DURACAO_RECOMENDADA.minSeg || duracaoSeg > DURACAO_RECOMENDADA.maxSeg;
}

/**
 * O que mudou entre as bordas originais e as arrastadas.
 *
 * O PATCH sai uma vez, no fim do arraste — não a cada movimento do ponteiro.
 * Mandar só o campo que mudou mantém a chamada honesta: o backend valida os
 * dois juntos, mas o log de quem alterou o quê fica legível.
 *
 * Devolve `null` quando nada mudou de fato, e aí não há PATCH nenhum: um clique
 * seco na alça, sem arrastar, não deve gastar uma escrita.
 */
export function diferenca(antes: Bordas, depois: Bordas): Partial<Bordas> | null {
  const mudou: Partial<Bordas> = {};
  if (arredondar(antes.inicio) !== arredondar(depois.inicio)) mudou.inicio = arredondar(depois.inicio);
  if (arredondar(antes.fim) !== arredondar(depois.fim)) mudou.fim = arredondar(depois.fim);
  return Object.keys(mudou).length > 0 ? mudou : null;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, maximo));
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
