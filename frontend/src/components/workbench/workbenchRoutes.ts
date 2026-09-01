import { finalReviewPath, postProductionPath } from '@/features/post-production/postProductionNavigation';
import type { GlobalTabId, WorkbenchEtapa, WorkbenchTab } from './useWorkbenchTabs';

// ─────────────────────────────────────────────────────────────
// Mapeamento rota ↔ aba de trabalho (DE-PARA §0: rotas mantidas
// 1:1; a rota ativa abre/foca a aba correspondente).
//
// D-427: as rotas globais (Biblioteca, Ranking, Buscar, Padrões,
// Análises, Atalhos, Configurações) também viram aba — antes elas
// tomavam a área central por cima da aba de trabalho ativa. Este
// módulo é a fonte única dessa lista: o rail monta a navegação a
// partir dela.
// ─────────────────────────────────────────────────────────────

export interface GlobalTabInfo {
  id: GlobalTabId;
  path: string;
  label: string;
  /** Ícone do protótipo Workbench 1c (validação 1: usar os do design). */
  emoji: string;
  /** Divisor acima do item no rail (protótipo separa Atalhos/Configurações). */
  divisor?: boolean;
}

export const GLOBAL_TABS: readonly GlobalTabInfo[] = [
  { id: 'biblioteca', path: '/projetos', label: 'Biblioteca', emoji: '🏠' },
  { id: 'ranking', path: '/ranking-lives', label: 'Ranking de lives', emoji: '🏆' },
  { id: 'buscar', path: '/buscar-lives', label: 'Buscar lives', emoji: '📡' },
  { id: 'thumbnails', path: '/padroes-thumbnail', label: 'Padrões de thumbnail', emoji: '✨' },
  { id: 'shorts', path: '/shorts', label: 'Shorts', emoji: '🎬' },
  { id: 'analises', path: '/analises', label: 'Análises', emoji: '📊' },
  { id: 'atalhos', path: '/atalhos', label: 'Atalhos', emoji: '⌨', divisor: true },
  { id: 'config', path: '/canais', label: 'Configurações', emoji: '⚙' },
];

const GLOBAL_POR_ID = new Map(GLOBAL_TABS.map((info) => [info.id, info] as const));

export function globalTabInfo(id: GlobalTabId): GlobalTabInfo {
  return GLOBAL_POR_ID.get(id) ?? GLOBAL_TABS[0];
}

/** Rota da aba — inclui o corte amarrado mesmo nas etapas que o levam na query. */
export function tabPath(tab: WorkbenchTab): string {
  if (tab.kind === 'global') return globalTabInfo(tab.global).path;
  const { projetoId, corteId } = tab;
  switch (tab.etapa) {
    case 'workspace':
      return corteId ? `/projetos/${projetoId}?corte=${corteId}` : `/projetos/${projetoId}`;
    case 'cortes':
      return corteId ? `/projetos/${projetoId}/cortes/${corteId}` : `/projetos/${projetoId}/cortes`;
    case 'pos':
      return corteId
        ? postProductionPath(projetoId, corteId)
        : `/projetos/${projetoId}/post-production`;
    case 'metadados':
      return corteId
        ? `/projetos/${projetoId}/metadados?corte=${corteId}`
        : `/projetos/${projetoId}/metadados`;
    case 'revisao':
      return corteId
        ? finalReviewPath(projetoId, corteId)
        : `/projetos/${projetoId}/final-review`;
  }
}

const ROUTE_TO_ETAPA: ReadonlyArray<[RegExp, WorkbenchEtapa]> = [
  [/^\/projetos\/([^/]+)\/cortes(?:\/([^/]+))?\/?$/, 'cortes'],
  [/^\/projetos\/([^/]+)\/metadados\/?$/, 'metadados'],
  [/^\/projetos\/([^/]+)\/(?:post-production|export)\/?$/, 'pos'],
  [/^\/projetos\/([^/]+)\/final-review\/?$/, 'revisao'],
  [/^\/projetos\/([^/]+)\/?$/, 'workspace'],
];

/**
 * Converte a localização atual em aba. O corte vem do path (Bruto) ou
 * de `?corte=` (Pós, Metadados, Revisão) — é ele que mantém a aba
 * amarrada ao mesmo corte quando a etapa muda.
 */
export function routeToTab(pathname: string, search = ''): WorkbenchTab | null {
  const normalizado = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const global = GLOBAL_TABS.find((info) => info.path === normalizado);
  if (global) return { kind: 'global', global: global.id };

  for (const [pattern, etapa] of ROUTE_TO_ETAPA) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    const corteId = match[2] || new URLSearchParams(search).get('corte') || undefined;
    const tab: WorkbenchTab = { kind: 'projeto', projetoId: match[1], etapa };
    if (corteId) tab.corteId = corteId;
    return tab;
  }
  return null;
}

// "Bruto" (não "Cortes"): é o nome da etapa no redesign v3 — protótipo,
// barra de etapas e hand-off usam o mesmo vocabulário.
export const ETAPA_LABELS: Record<WorkbenchEtapa, string> = {
  workspace: 'Workspace',
  cortes: 'Bruto',
  pos: 'Pós',
  metadados: 'Metadados',
  revisao: 'Revisão',
};

/** Cor do dot de status da aba (protótipo: cor da etapa). */
export const ETAPA_DOT_TOKENS: Record<WorkbenchEtapa, string> = {
  workspace: 'var(--wb-ok)',
  cortes: 'var(--wb-accent)',
  pos: 'var(--wb-warn)',
  metadados: 'var(--wb-fire)',
  revisao: 'var(--wb-info)',
};

/**
 * Rótulo curto do projeto para a aba/rail ("267" em "LIVE 267 —
 * Respondendo inscritos"). Sem número no título, usa o começo dele.
 */
export function rotuloCurtoProjeto(tituloLive: string | undefined): string {
  const titulo = (tituloLive ?? '').trim();
  if (!titulo) return '?';
  const numero = /\b(\d{2,4})\b/.exec(titulo);
  if (numero) return numero[1];
  return titulo.length > 14 ? `${titulo.slice(0, 12)}…` : titulo;
}
