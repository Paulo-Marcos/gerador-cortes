import type { IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O mapa entre o protótipo e as rotas que existem de verdade.
//
// O handoff fala em "telas" (biblioteca, cortes, pos…) porque é um
// mock de estado único. A aplicação fala em rotas. Este arquivo é a
// tradução, e ele fica sozinho de propósito: a casca inteira depende
// de saber "onde estou", e concentrar essa resposta num lugar só
// evita que cada peça da casca invente a própria regex.
//
// RODADA 1 · a trilha passou a devolver DESTINOS, não texto. Uma
// migalha que diz "como cheguei aqui" e não deixa voltar é decoração;
// breadcrumb é navegação. O destino de cada migalha fixa mora aqui
// (ROTA_FIXA) e o das migalhas de dados também (SLOT_ROTA) — assim
// nenhuma tela precisou aprender a montar a própria trilha.
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
  | 'fila'
  | 'kit'
  | 'erro';

/** Uma migalha da trilha. Sem `to` ela é texto — é o caso da última. */
export type Migalha = { texto: string; to?: string };

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
  [/^\/fila/, 'fila'],
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
  fila: { icone: 'loader', titulo: 'Fila de processamento' },
  kit: { icone: 'layout-template', titulo: 'Componentes' },
  erro: { icone: 'triangle-alert', titulo: 'Página não encontrada' },
};

// ── Trilha (breadcrumb) ──────────────────────────────────────────
// A última migalha é sempre a tela atual, em peso 700 e SEM destino:
// clicar em "onde estou" não é lugar nenhum. As anteriores situam e
// levam de volta.
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
  fila: ['Fila'],
  kit: ['Componentes'],
  erro: ['Página não encontrada'],
};

/**
 * Destino das migalhas de texto fixo. "Inteligência" fica de fora de
 * propósito: é o nome de um GRUPO do trilho, não de uma tela — dar a
 * ela um link seria prometer uma página que não existe.
 */
const ROTA_FIXA: Record<string, (projetoId: string | null) => string | undefined> = {
  Biblioteca: () => '/projetos',
  Shorts: () => '/shorts',
  Cortes: (id) => (id ? `/projetos/${id}/cortes` : undefined),
  'Pós-produção': (id) => (id ? `/projetos/${id}/post-production` : undefined),
  Metadados: (id) => (id ? `/projetos/${id}/metadados` : undefined),
  'Revisão final': (id) => (id ? `/projetos/${id}/final-review` : undefined),
  Fila: () => '/fila',
  Configurações: () => '/canais',
};

/**
 * Destino PADRÃO de cada slot, por tela e por posição. É o que torna
 * "LIVE 267" clicável sem que nenhuma tela mude uma linha: o primeiro
 * slot das telas de dentro de uma live é sempre a própria live.
 *
 * Uma tela pode sobrescrever passando `{ texto, to }` em vez de string.
 */
const SLOT_ROTA: Partial<Record<TelaId, Array<(projetoId: string | null) => string | undefined>>> = {
  cortes: [(id) => (id ? `/projetos/${id}` : undefined)],
  pos: [(id) => (id ? `/projetos/${id}` : undefined)],
  metadados: [(id) => (id ? `/projetos/${id}` : undefined)],
  revisao: [(id) => (id ? `/projetos/${id}` : undefined)],
};

/**
 * Monta a trilha preenchendo os slots `{}` com `rotulos`, na ordem.
 * Slots sobrando somem; rótulos sobrando são ignorados.
 *
 * `rotulos` aceita string (o caso comum — o destino vem de SLOT_ROTA)
 * ou `{ texto, to }` quando a tela quer mandar no destino.
 */
export function trilhaDaTela(
  tela: TelaId,
  rotulos: Array<string | Migalha> = [],
  projetoId: string | null = null,
): Migalha[] {
  const base = TRILHA_BASE[tela] ?? TRILHA_BASE.biblioteca;
  const destinosDeSlot = SLOT_ROTA[tela] ?? [];
  let proximo = 0;

  const migalhas = base.flatMap<Migalha>((parte) => {
    if (parte !== SLOT) {
      return [{ texto: parte, to: ROTA_FIXA[parte]?.(projetoId) }];
    }
    const posicao = proximo;
    const rotulo = rotulos[posicao];
    proximo += 1;
    if (!rotulo) return [];
    if (typeof rotulo === 'string') {
      return [{ texto: rotulo, to: destinosDeSlot[posicao]?.(projetoId) }];
    }
    return [{ texto: rotulo.texto, to: rotulo.to ?? destinosDeSlot[posicao]?.(projetoId) }];
  });

  // A última migalha é o lugar onde a pessoa já está. Link para cá só
  // gastaria um clique para não sair do lugar.
  if (migalhas.length > 0) migalhas[migalhas.length - 1] = { texto: migalhas[migalhas.length - 1].texto };

  return migalhas;
}
