// D-1149 (E-069 H-16) · As colunas da lista de cortes da live (DIRECAO §7.2). A tela as
// declara uma vez na `Lista` (`--cols`), e cada linha ocupa a mesma grade por `subgrid`:
// cabeçalho e linhas alinham sem que a linha saiba a largura de ninguém.

/**
 * As colunas da lista, na ordem do §7.2. Com janela larga as etapas têm coluna própria;
 * abaixo de BARRA_EM_COLUNA_MIN_PX elas descem para baixo do título, que a 1024 px ficava
 * sem espaço (D-868).
 */
export function colunasDaLinha(comSelecao: boolean, barraEmColuna: boolean): string {
  return [
    comSelecao && '18px',
    '48px',
    '112px',
    'minmax(0, 1fr)',
    '64px',
    '34px',
    // As etapas: os oito traços (~110 px) e, embaixo, a frase ("4 de 8 · próximo: aplicar filtro").
    barraEmColuna && '208px',
    '84px',
    // A ação tem largura fixa: cada `<li>` é uma grade, e uma coluna que mede o conteúdo
    // ("Aprovar" × "Gerar bruto no editor") desalinhava as linhas entre si e do cabeçalho.
    '168px',
    '32px',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Os títulos das colunas, para o cabeçalho da lista (a mesma grade). */
export function titulosDasColunas(comSelecao: boolean, barraEmColuna: boolean): string[] {
  return [
    ...(comSelecao ? [''] : []),
    'nº',
    '',
    'Corte',
    'Duração',
    'Nota',
    ...(barraEmColuna ? ['Etapas'] : []),
    'Estado',
    '',
    '',
  ];
}
