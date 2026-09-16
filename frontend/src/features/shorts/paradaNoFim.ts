// D-539: o player para no fim do trecho, e não segue vida afora.
//
// O player da curadoria é o BRUTO inteiro, e um short é uma janela dentro dele.
// "Assistir" levava o cursor ao início do trecho e soltava — a partir daí o
// vídeo seguia pelo que vem depois, e o operador só percebia que passou do fim
// quando o assunto mudava. Para julgar se um corte fecha bem, o fim precisa
// chegar como fim, e não como "em algum lugar aí atrás".
//
// A parada é uma propriedade do GESTO, não do trecho: ela nasce quando se pede
// para assistir e morre no primeiro dos dois eventos — chegar no fim, ou o
// operador pegar o cursor com a mão. A segunda regra é o que impede a emboscada
// de um `pause` disparando minutos depois, num lugar que não tem nada a ver com
// o short que se mandou tocar.

/** Um quadro a 25fps. Parar um triz antes é melhor que um triz depois: o
 *  primeiro frame do que vem a seguir já é o assunto errado na tela. */
export const FOLGA_SEG = 0.04;

/**
 * O cursor alcançou o fim armado?
 *
 * `null` = nada armado, e aí nunca. Manter isso como pergunta (e não como um
 * `if` espalhado) é o que permite testar a regra sem um `<video>`.
 *
 * @example
 * alcancouOFim(30, 29.9)   // false
 * alcancouOFim(30, 29.97)  // true — dentro da folga de um quadro
 * alcancouOFim(null, 999)  // false
 */
export function alcancouOFim(fimSeg: number | null, agoraSeg: number): boolean {
  return fimSeg !== null && agoraSeg >= fimSeg - FOLGA_SEG;
}

/**
 * Um seek desarma a parada — a menos que tenha sido nosso.
 *
 * Nós mesmos movemos o cursor o tempo todo: ao começar a tocar o trecho, ao
 * pular para uma borda. Se cada um desses desarmasse, a parada morreria no
 * mesmo instante em que nasce.
 *
 * @example
 * desarmaNoSeek(true)   // false — fomos nós que movemos
 * desarmaNoSeek(false)  // true  — foi a mão do operador
 */
export function desarmaNoSeek(seekNosso: boolean): boolean {
  return !seekNosso;
}

/** Uma janela do bruto que o player vai tocar. */
export interface Janela {
  inicio: number;
  fim: number;
}

/**
 * D-604: a próxima janela da colagem, ou `null` quando esta era a última.
 *
 * O que transforma "parar no fim" em "pular o buraco": um short colado tem N
 * janelas, e ao alcançar o fim de uma o certo é ir para o início da seguinte —
 * não pausar. Pausar no primeiro buraco faria o operador achar que o short
 * acabou aos 30s, quando ele tem 45s de vídeo.
 *
 * `null` na última mantém o comportamento da D-539: ali o fim é fim.
 *
 * @example
 * proximaJanela([{inicio: 0, fim: 30}, {inicio: 45, fim: 60}], 0)  // {inicio: 45, fim: 60}
 * proximaJanela([{inicio: 0, fim: 30}], 0)                          // null
 */
export function proximaJanela(janelas: Janela[], indice: number): Janela | null {
  return janelas[indice + 1] ?? null;
}
