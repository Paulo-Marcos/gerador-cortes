// D-548: uma cor por short na régua, e sempre a MESMA cor.
//
// A régua passou a mostrar vários trechos sobre a onda, e cinza para todos os
// deixava indistinguíveis: para saber qual bloco era qual, o operador tinha de
// clicar. Cor resolve isso sem texto, que numa faixa de 80px não caberia.
//
// ## Por que derivada do índice, e não sorteada
//
// A cor precisa sobreviver a um refetch. Se ela mudasse a cada render, o
// operador perderia a única âncora que tem entre o bloco na régua e o card na
// coluna — e um mapa que muda sozinho é pior que mapa nenhum, porque ele confia
// no primeiro e se perde no segundo.
//
// O índice é a ordem cronológica dos trechos, que é estável enquanto ninguém
// cria ou apaga. Criar um trecho no meio reordena as cores dali para a frente;
// é o preço de não guardar cor no banco, e é barato — a leitura é "estes são
// blocos diferentes", não "azul significa tal coisa".

/**
 * Matizes escolhidos para se distinguirem sobre o fundo escuro da régua, e
 * entre si. Evitam o verde do canal de propósito: ele já é a cor da moldura e
 * do que está selecionado, e repeti-lo aqui faria um short parecer ativo.
 */
const MATIZES = [210, 32, 275, 150, 350, 95, 190, 55] as const;

/** Quanto a cor invade o bloco. Translúcida, porque a onda passa por baixo. */
const OPACIDADE_DA_AREA = 0.28;
const OPACIDADE_DA_BORDA = 0.9;

/**
 * A cor da área de um short na régua.
 *
 * @example
 * corDoShort(0)  // 'hsl(210 70% 55% / 0.28)'
 * corDoShort(8)  // volta ao primeiro matiz
 */
export function corDoShort(indice: number): string {
  return `hsl(${matizDe(indice)} 70% 55% / ${OPACIDADE_DA_AREA})`;
}

/** A borda do mesmo bloco — o mesmo matiz, opaco, para marcar onde ele acaba. */
export function bordaDoShort(indice: number): string {
  return `hsl(${matizDe(indice)} 75% 62% / ${OPACIDADE_DA_BORDA})`;
}

/**
 * O bloco de um short REJEITADO: sem cor.
 *
 * Ele continua na régua porque ocupa tempo — saber que aquele pedaço já foi
 * olhado e descartado evita reavaliá-lo. Mas competir por atenção com os que
 * ainda estão em jogo seria ruído.
 */
export const COR_DO_REJEITADO = 'hsl(0 0% 60% / 0.12)';
export const BORDA_DO_REJEITADO = 'hsl(0 0% 70% / 0.35)';

function matizDe(indice: number): number {
  const posicao = ((indice % MATIZES.length) + MATIZES.length) % MATIZES.length;
  return MATIZES[posicao];
}
