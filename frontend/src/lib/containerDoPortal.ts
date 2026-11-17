// D-599: o que flutua nasce num PORTAL, e portal para o <body> sai de dentro da casca
// `.ap` — onde moram o tema claro/escuro e a ponte de tokens da camada antiga. Sem
// isto a peça nascia com os valores de `:root`. Com a casca ligada o portal aponta
// para o próprio `.ap`, e a peça herda o tema como qualquer outra da tela.
export function containerDoPortal(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLElement>('.ap') ?? undefined;
}
