// Régua da catraca `umPrimarioPorTela` (D-1115, E-069 H-06; DIRECAO §5 e §9.4).
// Cada tela redesenhada tem um teste de render que chama `esperarPrimarios`:
// a tela que tem primário tem exatamente um botão `data-variant="primary"` no HTML, e
// a que não tem (escolha e leitura) tem zero. O botão novo (H-07) é quem
// escreve o `data-variant`.

/** O primário de cada tela, da §5 da DIRECAO. `Shorts`, `Configuracoes`, `Analises` e `Fila` não têm. */
export const PRIMARIOS_POR_TELA = {
  Biblioteca: 1,
  BibliotecaVazia: 1,
  CortesDaLive: 1,
  Metadados: 1,
  Revisao: 1,
  Editor: 1,
  Pos: 1,
  Shorts: 0,
  Configuracoes: 0,
  Analises: 0,
  Fila: 0,
} as const;

export type TelaComPrimario = keyof typeof PRIMARIOS_POR_TELA;

/** Os botões primários no HTML que a tela renderiza (`renderToStaticMarkup`). */
export function contarPrimarios(html: string): number {
  return (html.match(/<button[^>]*\bdata-variant="primary"/g) ?? []).length;
}

/** O assert do teste de render de cada tela. */
export function esperarPrimarios(html: string, tela: TelaComPrimario): void {
  expect(contarPrimarios(html), `${tela} deve ter ${PRIMARIOS_POR_TELA[tela]} botão primário`).toBe(
    PRIMARIOS_POR_TELA[tela],
  );
}
