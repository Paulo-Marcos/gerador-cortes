/**
 * Prende `valor` entre `minimo` e `maximo`. Se a faixa vier invertida
 * (`minimo > maximo`), vence o `minimo` — era o que as seis cópias que este
 * arquivo substituiu faziam (D-730).
 */
export function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}
