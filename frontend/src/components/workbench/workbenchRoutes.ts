import type { WorkbenchEtapa, WorkbenchTab } from './useWorkbenchTabs';

// ─────────────────────────────────────────────────────────────
// Mapeamento rota ↔ aba de trabalho (DE-PARA §0: rotas mantidas
// 1:1; a rota ativa abre/foca a aba correspondente). Rotas
// globais (biblioteca, ranking, buscar, padrões, análises,
// canais) não viram aba — são navegação do rail.
// ─────────────────────────────────────────────────────────────

export function tabPath(tab: WorkbenchTab): string {
  switch (tab.etapa) {
    case 'workspace':
      return `/projetos/${tab.projetoId}`;
    case 'cortes':
      return tab.corteId
        ? `/projetos/${tab.projetoId}/cortes/${tab.corteId}`
        : `/projetos/${tab.projetoId}/cortes`;
    case 'pos':
      return `/projetos/${tab.projetoId}/post-production`;
    case 'metadados':
      return `/projetos/${tab.projetoId}/metadados`;
    case 'revisao':
      return `/projetos/${tab.projetoId}/final-review`;
  }
}

const ROUTE_TO_ETAPA: ReadonlyArray<[RegExp, WorkbenchEtapa]> = [
  [/^\/projetos\/([^/]+)\/cortes(?:\/([^/]+))?\/?$/, 'cortes'],
  [/^\/projetos\/([^/]+)\/metadados\/?$/, 'metadados'],
  [/^\/projetos\/([^/]+)\/(?:post-production|export)\/?$/, 'pos'],
  [/^\/projetos\/([^/]+)\/final-review\/?$/, 'revisao'],
  [/^\/projetos\/([^/]+)\/?$/, 'workspace'],
];

/** Converte um pathname em aba; null para rotas globais (sem aba). */
export function routeToTab(pathname: string): WorkbenchTab | null {
  for (const [pattern, etapa] of ROUTE_TO_ETAPA) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    const tab: WorkbenchTab = { projetoId: match[1], etapa };
    if (etapa === 'cortes' && match[2]) tab.corteId = match[2];
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
