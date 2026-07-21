import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useCanais } from '@/features/channels/useChannels';
import {
  finalReviewPath,
  postProductionPath,
} from '@/features/post-production/postProductionNavigation';
import { useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { ETAPA_DOT_TOKENS, ETAPA_LABELS, routeToTab, tabPath } from './workbenchRoutes';
import type { WorkbenchEtapa } from './useWorkbenchTabs';

// ─────────────────────────────────────────────────────────────
// Regra 0 do redesign (DE-PARA-v3 §0): barra de etapas do projeto,
// sempre visível abaixo do TabStrip nas 5 telas do pipeline. Um
// único ponto de montagem (WorkbenchShell) cobre Workspace, Bruto,
// Pós, Metadados e Revisão — sem duplicar lógica de rota: reaproveita
// tabPath/postProductionPath/finalReviewPath.
//
// Visual (protótipo Workbench v3): eyebrow "@canal ·" + pill segmentado
// com setas entre as etapas; item ativo sólido em --wb-accent.
// ─────────────────────────────────────────────────────────────

const ETAPAS: readonly WorkbenchEtapa[] = ['workspace', 'cortes', 'pos', 'metadados', 'revisao'];

const TITULOS: Record<WorkbenchEtapa, string> = {
  workspace: 'Workspace do projeto',
  cortes: 'Editor Bruto',
  pos: 'Pós-produção',
  metadados: 'Metadados & Thumbnails',
  revisao: 'Revisão final',
};

/** "@ateuinforma" a partir do handle do canal ativo (tolera handle já com @). */
function useHandleDoCanalAtivo(): string | undefined {
  const { data } = useCanais();
  const handle = data?.canais.find((canal) => canal.ativo)?.handle?.trim();
  if (!handle) return undefined;
  return `@${handle.replace(/^@/, '')}`;
}

export function ProjectStageBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { activeTab } = useWorkbenchTabsContext();
  const handleCanal = useHandleDoCanalAtivo();

  const atual = routeToTab(pathname);
  // O corte selecionado sobrevive à troca de etapa: vem da rota, da
  // querystring (?corte=) ou da aba ativa do mesmo projeto.
  const corteDaRota = atual?.corteId ?? searchParams.get('corte') ?? undefined;
  const corteId =
    corteDaRota ?? (activeTab?.projetoId === atual?.projetoId ? activeTab?.corteId : undefined);

  if (!atual) return null;
  const { projetoId, etapa: etapaAtiva } = atual;

  const irPara = (etapa: WorkbenchEtapa) => {
    if (etapa === 'pos' && corteId) return navigate(postProductionPath(projetoId, corteId));
    if (etapa === 'revisao' && corteId) return navigate(finalReviewPath(projetoId, corteId));
    navigate(tabPath({ projetoId, etapa, corteId: etapa === 'cortes' ? corteId : undefined }));
  };

  return (
    <div className="flex flex-none flex-wrap items-center gap-3 border-b border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3.5 py-[7px]">
      {handleCanal && (
        <span className="flex-none font-code text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--wb-text-dim)]">
          {handleCanal} ·
        </span>
      )}

      <div
        role="tablist"
        aria-label="Etapas do projeto"
        className="inline-flex items-center gap-0.5 rounded-full border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-[3px]"
      >
        {ETAPAS.map((etapa, i) => {
          const ativa = etapa === etapaAtiva;
          return (
            <div key={etapa} className="flex items-center">
              {i > 0 && (
                <span aria-hidden className="px-0.5 text-[9px] text-[var(--wb-text-dim)]">
                  →
                </span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={ativa}
                title={TITULOS[etapa]}
                onClick={() => irPara(etapa)}
                className={cn(
                  'inline-flex h-[26px] items-center gap-1.5 rounded-full px-[13px] text-[11px] font-bold transition-colors',
                  ativa
                    ? 'bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]'
                    : 'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-panel)] hover:text-[var(--wb-text)]',
                )}
              >
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] flex-none rounded-full"
                  style={{ background: ETAPA_DOT_TOKENS[etapa] }}
                />
                {ETAPA_LABELS[etapa]}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
