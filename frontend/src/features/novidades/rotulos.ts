// D-922: como a tela de Novidades fala de cada coisa. Puro, para testar sem tela.

/** A seção do CHANGELOG que já está na main e ainda não ganhou número. */
export const SEM_VERSAO = 'Unreleased';

type Tom = 'ok' | 'info' | 'warn' | 'err' | 'mute';

const CATEGORIAS: Record<string, { rotulo: string; tom: Tom }> = {
  added: { rotulo: 'Novo', tom: 'ok' },
  changed: { rotulo: 'Mudou', tom: 'info' },
  fixed: { rotulo: 'Corrigido', tom: 'warn' },
  removed: { rotulo: 'Saiu', tom: 'err' },
  deprecated: { rotulo: 'Vai sair', tom: 'err' },
  security: { rotulo: 'Segurança', tom: 'err' },
  housekeeping: { rotulo: 'Manutenção', tom: 'mute' },
};

export function rotuloDaCategoria(categoria: string): { rotulo: string; tom: Tom } {
  return CATEGORIAS[categoria] ?? { rotulo: categoria, tom: 'mute' };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Versão 0.6.0 · 7 out 2026"; a seção sem número diz onde ela está. */
export function tituloDaVersao(versao: string, data: string | null): string {
  if (versao === SEM_VERSAO) return 'Já na main, ainda sem número de versão';
  if (!data) return `Versão ${versao}`;
  // Lida como texto, e não como Date: "2026-10-07" em UTC vira dia 6 no Brasil.
  const [ano, mes, dia] = data.split('-').map(Number);
  return `Versão ${versao} · ${dia} ${MESES[mes - 1]} ${ano}`;
}

/** O motivo do ponto no trilho. */
export function avisoDasNovidades(novas: number): string {
  return novas === 1
    ? '1 novidade que você ainda não viu'
    : `${novas} novidades que você ainda não viu`;
}

/**
 * O original para ler: sem o título em negrito (ele já está no cartão) e com
 * as linhas reunidas — o CHANGELOG quebra em 80 colunas, a tela não. Só um
 * subitem (`- `) começa linha nova.
 */
export function textoCorrido(texto: string): string {
  return texto
    .replace(/^\*\*.+?\*\*\s*/, '')
    .split('\n')
    .map((linha) => linha.trim())
    .reduce((acc, linha) => (linha.startsWith('- ') ? `${acc}\n${linha}` : `${acc} ${linha}`), '')
    .trim();
}

/** O texto em pedaços, com o que estava entre crases marcado como código. */
export function trechosComCodigo(texto: string): Array<{ texto: string; codigo: boolean }> {
  return texto
    .split('`')
    .map((pedaco, i) => ({ texto: pedaco, codigo: i % 2 === 1 }))
    .filter((trecho) => trecho.texto !== '');
}

/** O "como usar" vem em frases ou passos separados por quebra de linha. */
export function passosDoComoUsar(comoUsar: string): string[] {
  return comoUsar
    .split('\n')
    .map((linha) => linha.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}
