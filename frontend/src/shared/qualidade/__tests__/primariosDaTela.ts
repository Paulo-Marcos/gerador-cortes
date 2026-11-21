// Régua da catraca `umPrimarioPorTela` (D-1115, E-069 H-06; DIRECAO §5 e §9.4; D-1138).
// Cada tela redesenhada tem um teste de render que chama `esperarPrimarios`:
// a tela que tem primário tem exatamente um botão primário (`data-variant="primario"`,
// o que o Button novo emite; o legado emite `default`, que não conta) e ele está
// aceso, sem `disabled`. A que não tem (escolha e leitura) tem zero.
// Limite: só lê `<button`; primário com `asChild` virando `<a>` não é contado.

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

// O Button novo grava `primario`; o legado grava `default` (button.tsx), que não é primário.
// `primary` nenhum Button emite. Sem a variante certa a régua contava zero e passava no vazio.
const VARIANTES_PRIMARIAS = /\bdata-variant="primario"/;
// `disabled` de verdade, não `aria-disabled` nem `data-disabled`, nem a palavra dentro de um
// valor de atributo (`title="fica disabled até"`): os valores entre aspas saem antes do teste.
const DESABILITADO = /(?:^|\s)disabled(?=[\s=>/])/;

/** As tags de abertura dos botões primários que a tela renderiza (`renderToStaticMarkup`). */
function primarios(html: string): string[] {
  return (html.match(/<button\b[^>]*>/g) ?? []).filter((tag) => VARIANTES_PRIMARIAS.test(tag));
}

/** Os botões primários no HTML, acesos ou não. */
export function contarPrimarios(html: string): number {
  return primarios(html).length;
}

/** Os primários sem `disabled`: o Button grava a variante mesmo desabilitado. */
export function contarPrimariosAcesos(html: string): number {
  return primarios(html).filter((tag) => !DESABILITADO.test(tag.replace(/"[^"]*"/g, '""'))).length;
}

/**
 * O assert do teste de render de cada tela. A tela que tem primário o tem aceso: primário
 * morto é tela sem ação principal. Um estado em que ele fica desabilitado de propósito
 * (ex.: "Publicar" sem corte aprovado) declara `primarioDesabilitado: true` no próprio teste.
 */
export function esperarPrimarios(
  html: string,
  tela: TelaComPrimario,
  { primarioDesabilitado = false }: { primarioDesabilitado?: boolean } = {},
): void {
  const esperado = PRIMARIOS_POR_TELA[tela];
  expect(contarPrimarios(html), `${tela} deve ter ${esperado} botão primário`).toBe(esperado);
  if (esperado > 0 && !primarioDesabilitado) {
    expect(
      contarPrimariosAcesos(html),
      `${tela}: o botão primário está desabilitado (passe { primarioDesabilitado: true } só se o estado pede)`,
    ).toBe(esperado);
  }
}
