/**
 * O corpo da etiqueta da capa do TikTok, comum aos dois estilos (D-533, D-932).
 *
 * Mora fora do entry porque a capa limpa (`capa-tiktok-limpa.tsx`) faz a mesma
 * conta, e o entry chama `registerRoot` — importá-lo registraria a raiz duas vezes.
 */

export type Faixa = { x: number; y: number; w: number; h: number };

// D-533: quanto uma letra ocupa, em fração do corpo da fonte.
//
// Medido no render real: com Inter Black em caixa alta e letter-spacing -0.02em,
// couberam ~10,5 caracteres numa faixa de 980px a 108px de corpo. A conta serve
// para ESCOLHER o corpo, não para prometer precisão tipográfica — errar para
// menos só deixa sobrar margem.
const LARGURA_MEDIA_DA_LETRA = 0.86;

export const ENTRELINHA = 1.02;
const CORPO_MAXIMO = 136;

// A conta resolve o corpo que cabe EXATAMENTE. Sem folga, uma palavra larga —
// "ANTISSISTEMA" — estoura por alguns pixels e o clamp volta a cortar. 6% é
// pouco de corpo e bastante de segurança.
const FOLGA = 0.94;

/**
 * O corpo que faz o texto INTEIRO caber na faixa.
 *
 * Antes o corpo era um degrau fixo (136 ou 108 conforme o comprimento) e a
 * sobra era resolvida por `-webkit-line-clamp: 2`, que corta e escreve "…". O
 * sintoma: "TODO MUNDO ASSINOU EMBAIXO" virava "TODO MUNDO ASSINOU…". Perder a
 * última palavra de um texto que o operador escreveu à mão é pior que qualquer
 * corpo pequeno — e é silencioso, que é o que faz dele um defeito.
 *
 * Agora as duas dimensões da faixa mandam. Para cada número de linhas, o corpo
 * é o menor entre o que cabe na largura e o que cabe na altura; fica o maior
 * dos três.
 */
export function corpoQueCabe(
  texto: string,
  faixa: Faixa,
): { fontSize: number; linhas: number } {
  const caracteres = Math.max(texto.length, 1);
  let melhor = { fontSize: 0, linhas: 1 };

  for (const linhas of [1, 2, 3]) {
    const porLargura =
      (linhas * faixa.w) / (LARGURA_MEDIA_DA_LETRA * caracteres);
    const porAltura = faixa.h / (linhas * ENTRELINHA);
    const fontSize = Math.min(porLargura * FOLGA, porAltura, CORPO_MAXIMO);
    if (fontSize > melhor.fontSize) melhor = { fontSize, linhas };
  }
  return melhor;
}

