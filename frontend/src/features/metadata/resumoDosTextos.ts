// D-1167 (E-069 H-19, DIRECAO §7.5): o que o bloco recolhível "Descrição, capítulos e tags"
// mostra enquanto está fechado — para cada parte, "preenchida" ou "falta". Quem fecha o bloco
// não precisa abri-lo para saber se ainda deve algo.
//
// Os capítulos do YouTube não têm campo próprio: são as linhas da descrição que começam por um
// tempo (`0:00 Abertura`). O YouTube só os reconhece com ao menos três, começando em 0:00.

const LINHA_DE_CAPITULO = /^\s*\(?\d{1,2}:\d{2}(?::\d{2})?\b/;

/** Quantas linhas da descrição são capítulos (começam por um tempo `m:ss` ou `h:mm:ss`). */
export function contarCapitulos(descricao: string): number {
  return descricao.split('\n').filter((linha) => LINHA_DE_CAPITULO.test(linha)).length;
}

/** As tags do campo de texto, separadas por vírgula, sem vazias. */
export function separarTags(texto: string): string[] {
  return texto
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export type ParteDoResumo = { chave: 'descricao' | 'capitulos' | 'tags'; rotulo: string; preenchida: boolean };

/** Descrição, capítulos e tags, cada um preenchido ou faltando. */
export function resumoDosTextos(descricao: string, tagsTexto: string): ParteDoResumo[] {
  return [
    { chave: 'descricao', rotulo: 'Descrição', preenchida: descricao.trim().length > 0 },
    { chave: 'capitulos', rotulo: 'Capítulos', preenchida: contarCapitulos(descricao) >= 3 },
    { chave: 'tags', rotulo: 'Tags', preenchida: separarTags(tagsTexto).length > 0 },
  ];
}
