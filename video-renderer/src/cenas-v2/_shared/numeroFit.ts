/**
 * Auto-fit do número da cena `destaque_numerico`.
 *
 * O número é renderizado num corpo fixo (antes: 360px cravado), o que estourava
 * a referência visual do anel reticle quando o valor era grande ("1.000.000",
 * "45 anos"). Aqui derivamos o `fontSize` a partir do comprimento do texto FINAL
 * — o mesmo espírito determinístico do `sizeFor`/`fontSizeFor` dos outros cards
 * (CenaEnfase, CenaComparativo, CenaCitacao), porém contínuo em vez de degraus.
 *
 * É puro de propósito (sem React/Remotion): roda em qualquer ambiente e é
 * testável isoladamente.
 */

export interface NumeroFitOptions {
  /** Corpo máximo, usado quando o texto é curto. Default 360. */
  baseSize?: number;
  /** Piso de corpo para textos muito longos. Default 96. */
  minSize?: number;
  /**
   * Largura útil (px) na qual o número deve caber. Default 660 — mantém o
   * número dentro do anel reticle de fundo (780px) com respiro.
   */
  maxWidth?: number;
  /**
   * Avanço médio de glifo dividido pelo fontSize, para a fonte display pesada.
   * Estima a largura sem medir o DOM. Default 0.6 (conservador).
   */
  glyphRatio?: number;
}

/**
 * Retorna o `fontSize` (px) para o número caber em `maxWidth`, partindo de
 * `baseSize` e reduzindo proporcionalmente conforme o texto cresce.
 *
 * @param texto Texto FINAL a exibir (valor formatado + sufixo). Usar o valor
 *   final — e não o número animado da contagem — mantém o corpo estável durante
 *   o count-up, evitando "jitter" de escala.
 */
export function numeroFontSize(texto: string, options: NumeroFitOptions = {}): number {
  const { baseSize = 360, minSize = 96, maxWidth = 660, glyphRatio = 0.6 } = options;

  // Conta por codepoint para não contar pares substitutos como 2 caracteres.
  const len = [...String(texto ?? "")].length;
  if (len <= 0) return baseSize;

  const larguraNoBase = len * glyphRatio * baseSize;
  if (larguraNoBase <= maxWidth) return baseSize;

  const corpoCalculado = maxWidth / (len * glyphRatio);
  return Math.max(minSize, Math.round(corpoCalculado));
}
