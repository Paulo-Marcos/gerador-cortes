// D-530: pegar a imagem que está na área de transferência.
//
// A thumbnail do YouTube aceita Ctrl+V porque o card inteiro escuta `paste`. A
// capa do TikTok não podia herdar isso: dois ouvintes de `paste` na mesma
// árvore disputariam o evento, e a imagem cairia no slot errado — o de cima,
// que é 16:9. Um botão resolve sem ambiguidade: o alvo é onde se clicou.
//
// Módulo puro o suficiente para ter teste: recebe os itens já lidos e decide
// qual serve. O `navigator.clipboard` fica na borda, em `lerImagemColada`.

/** Os tipos que o gerador de imagem costuma pôr na área de transferência. */
const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function primeiroTipoDeImagem(tipos: readonly string[]): string | null {
  // Ordem dos ACEITOS, e não a do clipboard: quando há PNG e JPEG do mesmo
  // print, o PNG é o sem perda — e a arte ainda vai ser recomposta na capa.
  for (const aceito of TIPOS_ACEITOS) {
    if (tipos.includes(aceito)) return aceito;
  }
  return null;
}

/** Nome do arquivo a partir do tipo MIME. O backend usa a extensão. */
export function nomeParaTipo(tipo: string): string {
  const extensao = tipo.split('/')[1] ?? 'png';
  return `colado.${extensao === 'jpeg' ? 'jpg' : extensao}`;
}

export class SemImagemColada extends Error {
  constructor() {
    super('Não há imagem na área de transferência. Copie a arte e tente de novo.');
    this.name = 'SemImagemColada';
  }
}

/**
 * A imagem da área de transferência, como `File`.
 *
 * Levanta `SemImagemColada` quando não há imagem, e propaga o erro do browser
 * quando a permissão é negada — os dois casos precisam de mensagens diferentes
 * na tela, e confundi-los mandaria o operador copiar de novo uma imagem que já
 * estava lá.
 */
export async function lerImagemColada(): Promise<File> {
  const itens = await navigator.clipboard.read();

  for (const item of itens) {
    const tipo = primeiroTipoDeImagem(item.types);
    if (!tipo) continue;
    const blob = await item.getType(tipo);
    return new File([blob], nomeParaTipo(tipo), { type: tipo });
  }

  throw new SemImagemColada();
}
