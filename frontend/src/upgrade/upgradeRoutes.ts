import type { IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O mapa entre o protótipo e as rotas que existem de verdade.
//
// O handoff fala em "telas" (biblioteca, cortes, pos…) porque é um
// mock de estado único. A aplicação fala em rotas. Este arquivo é a
// tradução, e ele fica sozinho de propósito: a casca inteira depende
// de saber "onde estou", e concentrar essa resposta num lugar só
// evita que cada peça da casca invente a própria regex.
// ─────────────────────────────────────────────────────────────────

export type TelaId =
  | 'biblioteca'
  | 'projeto'
  | 'cortes'
  | 'pos'
  | 'metadados'
  | 'revisao'
  | 'shorts'
  | 'fire'
  | 'prateleira'
  | 'lives'
  | 'ranking'
  | 'thumbs'
  | 'analises'
  | 'config'
  | 'atalhos'
  | 'kit'
  | 'erro';

const PADROES: Array<[RegExp, TelaId]> = [
  [/^\/projetos\/[^/]+\/cortes/, 'cortes'],
  [/^\/projetos\/[^/]+\/(post-production|export)/, 'pos'],
  [/^\/projetos\/[^/]+\/metadados/, 'metadados'],
  [/^\/projetos\/[^/]+\/final-review/, 'revisao'],
  [/^\/projetos\/[^/]+$/, 'projeto'],
  [/^\/projetos\/?$/, 'biblioteca'],
  [/^\/shorts\/[^/]+\/workspace/, 'prateleira'],
  [/^\/shorts\/[^/]+/, 'fire'],
  [/^\/shorts\/?$/, 'shorts'],
  [/^\/buscar-lives/, 'lives'],
  [/^\/ranking-lives/, 'ranking'],
  [/^\/padroes-thumbnail/, 'thumbs'],
  [/^\/analises/, 'analises'],
  [/^\/canais/, 'config'],
  [/^\/atalhos/, 'atalhos'],
  [/^\/upgrade/, 'kit'],
];

export function telaDaRota(pathname: string): TelaId {
  return PADROES.find(([re]) => re.test(pathname))?.[1] ?? 'erro';
}

/** Id do projeto quando a rota está dentro de um; `null` fora dele. */
export function projetoDaRota(pathname: string): string | null {
  return /^\/projetos\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/** Id do corte quando a rota aponta para um corte específico. */
export function corteDaRota(pathname: string): string | null {
  return (
    /^\/projetos\/[^/]+\/cortes\/([^/]+)/.exec(pathname)?.[1] ??
    /^\/shorts\/([^/]+)/.exec(pathname)?.[1] ??
    null
  );
}

// ── Cabeçalho de tela ────────────────────────────────────────────
// Só o ícone e o título fixos moram aqui. Subtítulo e ações dependem
// de dados (quantos cortes, quantos fire) e chegam pela tela, via
// `useDefinirChrome`.

export const CABECALHO: Record<TelaId, { icone: IconName; titulo: string }> = {
  biblioteca: { icone: 'home', titulo: 'Biblioteca de lives' },
  projeto: { icone: 'layout-grid', titulo: 'Workspace do projeto' },
  cortes: { icone: 'scissors', titulo: 'Editor de cortes' },
  pos: { icone: 'clapperboard', titulo: 'Pós-produção' },
  metadados: { icone: 'tags', titulo: 'Metadados & capas' },
  revisao: { icone: 'check-check', titulo: 'Revisão final' },
  shorts: { icone: 'flame', titulo: 'Shorts' },
  fire: { icone: 'flame', titulo: 'Curadoria do Fire' },
  prateleira: { icone: 'layout-grid', titulo: 'Prateleira do Fire' },
  lives: { icone: 'radio', titulo: 'Buscar lives do canal' },
  ranking: { icone: 'trophy', titulo: 'Ranking de lives' },
  thumbs: { icone: 'sparkles', titulo: 'Padrões de capa' },
  analises: { icone: 'bar-chart', titulo: 'Análises' },
  config: { icone: 'settings', titulo: 'Configurações' },
  atalhos: { icone: 'keyboard', titulo: 'Atalhos' },
  kit: { icone: 'layout-template', titulo: 'Componentes' },
  erro: { icone: 'triangle-alert', titulo: 'Página não encontrada' },
};

// ── Trilha (breadcrumb) ──────────────────────────────────────────
// A última migalha é sempre a tela atual, em peso 700. As anteriores
// situam: a trilha responde "como cheguei aqui", não "o que é isto".
//
// O token `{}` marca onde entra um rótulo vindo da tela — o nome da
// live, o número do corte. A posição importa: "Biblioteca › LIVE 267 ›
// Cortes › #7" conta uma história; a mesma lista fora de ordem, não.
// Slot sem rótulo simplesmente desaparece, o que deixa a trilha
// correta enquanto os dados ainda estão carregando.

const SLOT = '{}';

const TRILHA_BASE: Record<TelaId, string[]> = {
  biblioteca: ['Biblioteca'],
  projeto: ['Biblioteca', SLOT],
  cortes: ['Biblioteca', SLOT, 'Cortes', SLOT],
  pos: ['Biblioteca', SLOT, 'Pós-produção', SLOT],
  metadados: ['Biblioteca', SLOT, 'Metadados', SLOT],
  revisao: ['Biblioteca', SLOT, 'Revisão final'],
  shorts: ['Shorts'],
  fire: ['Shorts', SLOT, 'Curar'],
  prateleira: ['Shorts', SLOT, 'Prateleira'],
  lives: ['Inteligência', 'Buscar lives'],
  ranking: ['Inteligência', 'Ranking'],
  thumbs: ['Inteligência', 'Padrões de capa'],
  analises: ['Inteligência', 'Análises'],
  config: ['Configurações'],
  atalhos: ['Atalhos'],
  kit: ['Componentes'],
  erro: ['Página não encontrada'],
};

/**
 * Monta a trilha preenchendo os slots `{}` com `rotulos`, na ordem.
 * Slots sobrando somem; rótulos sobrando são ignorados.
 */
export function trilhaDaTela(tela: TelaId, rotulos: string[] = []): string[] {
  const base = TRILHA_BASE[tela] ?? TRILHA_BASE.biblioteca;
  let proximo = 0;
  return base.flatMap((parte) => {
    if (parte !== SLOT) return [parte];
    const rotulo = rotulos[proximo];
    proximo += 1;
    return rotulo ? [rotulo] : [];
  });
}
