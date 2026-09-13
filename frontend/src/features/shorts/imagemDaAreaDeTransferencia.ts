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

/** O pedaço de um `DataTransferItem` que o evento `paste` entrega e que importa aqui. */
export interface ItemColado {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

/**
 * D-586: a imagem de um Ctrl+V, ou `null` quando o que se colou não é imagem.
 *
 * Diferente de `lerImagemColada`, não pede permissão: o evento `paste` já traz
 * os itens, porque foi o operador quem apertou a tecla. É por isso que o modal
 * da capa do short pode escutar a janela inteira — enquanto ele está aberto,
 * não há outro slot na tela disputando a imagem.
 */
export function imagemDoColar(itens: readonly ItemColado[]): File | null {
  const arquivos = itens.filter((item) => item.kind === 'file');
  const tipo = primeiroTipoDeImagem(arquivos.map((item) => item.type));
  if (!tipo) return null;
  const arquivo = arquivos.find((item) => item.type === tipo)?.getAsFile();
  return arquivo ? new File([arquivo], nomeParaTipo(tipo), { type: tipo }) : null;
}

/** Colar dentro de um campo de texto é colar texto — não pode virar capa. */
export function alvoEditavel(alvo: EventTarget | null): boolean {
  // Pela forma, e não por `instanceof HTMLElement`: o alvo pode ser o próprio
  // `document` (foco em lugar nenhum), e assim o teste roda sem DOM.
  const elemento = alvo as Partial<HTMLElement> | null;
  if (typeof elemento?.closest !== 'function') return false;
  return Boolean(elemento.isContentEditable) || elemento.closest('input, textarea, select') !== null;
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
