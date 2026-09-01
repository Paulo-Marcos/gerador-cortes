// D-465: o contrato das cenas verticais.
//
// Deliberadamente MENOR que o do horizontal (`../schema`). Um short tem 15 a 90
// segundos e uma ideia só: repertório grande aqui não é riqueza, é distração —
// e cada tipo a mais é um tipo que a IA pode escolher errado.
//
// Quatro tipos, cada um resolvendo um momento do short:
//   hook    → o cartão de abertura que segura os 3 primeiros segundos;
//   numero  → o dado que sustenta o argumento;
//   citacao → a frase que vale ser lida, não só ouvida;
//   cta     → o convite para o vídeo longo, no fim.

export type TipoCenaShort = "hook" | "numero" | "citacao" | "cta";

export interface CenaShort {
  tipo: TipoCenaShort;
  /** Início e fim em segundos, na timeline do SHORT (que começa no zero). */
  inicio: number;
  fim: number;
  /** O texto principal — o que a cena existe para dizer. */
  texto: string;
  /** Linha de apoio: unidade do número, autor da citação, complemento do hook. */
  apoio?: string;
}

export const TIPOS_CENA_SHORT: readonly TipoCenaShort[] = [
  "hook",
  "numero",
  "citacao",
  "cta",
];

export function ehTipoCenaShort(valor: unknown): valor is TipoCenaShort {
  return typeof valor === "string" && (TIPOS_CENA_SHORT as readonly string[]).includes(valor);
}
