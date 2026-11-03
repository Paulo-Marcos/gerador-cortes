import type { CenaRemotion } from "../schema";

/**
 * D-1018: o rótulo do card de número. "Dado" era o padrão de todo número, e 10 de
 * 19 cards medidos eram hipótese da fala ("50x" era promessa). Agora o rótulo só
 * aparece com a fonte; sem ela, o card fica sem rótulo.
 */
export function rotuloDoNumero(cena: Pick<CenaRemotion, "subtexto" | "fonte">): string | undefined {
  return cena.subtexto || (cena.fonte ? "Dado" : undefined);
}
