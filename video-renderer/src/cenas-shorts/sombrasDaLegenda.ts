/**
 * D-913: como a legenda do short se separa do vídeo — fonte única para o render
 * (`LegendaShort`) e para a prévia do frontend (`LegendaPrevia`, via public-api).
 *
 * - `contorno`: o de sempre. Quatro sombras duras de 2 px fazem uma borda preta
 *   em volta de cada letra, mais uma sombra larga. Segura qualquer fundo.
 * - `sombra`: a do estilo limpo. Só uma sombra suave e larga, sem borda — o
 *   texto em giz com a palavra corrente no acento, como no canvas de design.
 *
 * Sem dependência de Remotion de propósito: o frontend importa este arquivo.
 */
export const ESTILOS_DA_LEGENDA = ["contorno", "sombra"] as const;
export type EstiloDaLegenda = (typeof ESTILOS_DA_LEGENDA)[number];

export const SOMBRAS_DA_LEGENDA: Record<EstiloDaLegenda, string> = {
  contorno:
    "0 2px 0 rgba(0,0,0,0.85), 0 -2px 0 rgba(0,0,0,0.85), 2px 0 0 rgba(0,0,0,0.85), -2px 0 0 rgba(0,0,0,0.85), 0 6px 18px rgba(0,0,0,0.55)",
  sombra: "0 4px 24px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.6)",
};
