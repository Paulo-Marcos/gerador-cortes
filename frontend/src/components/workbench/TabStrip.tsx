import { Moon, Plus, Scissors, Search, Sun, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useProjetos } from '@/hooks/useProjetos';
import type { Projeto } from '@/types/models';
import { useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { ETAPA_DOT_TOKENS, ETAPA_LABELS, rotuloCurtoProjeto, tabPath } from './workbenchRoutes';
import type { WorkbenchTab } from './useWorkbenchTabs';

// ─────────────────────────────────────────────────────────────
// TabStrip — faixa de abas de trabalho no topo do shell
// (DE-PARA §0). Abas "{rótulo} · {etapa}" com dot da etapa,
// progresso derivado dos contadores do projeto, fechar e ＋.
// ─────────────────────────────────────────────────────────────

/** Chip de progresso da aba, derivado dos contadores do Projeto. */
export function progressoDaAba(tab: WorkbenchTab, projeto: Projeto | undefined): string | null {
  if (!projeto) return null;
  switch (tab.etapa) {
    case 'cortes':
      return projeto.total_cortes > 0 ? `${projeto.total_aprovados}/${projeto.total_cortes}` : null;
    case 'pos':
      return projeto.total_aprovados > 0
        ? `${projeto.total_video_pronto}/${projeto.total_aprovados}`
        : null;
    case 'metadados':
      return projeto.total_aprovados > 0
        ? `${projeto.total_com_meta}/${projeto.total_aprovados}`
        : null;
    case 'revisao': {
      const prontos = projeto.total_video_pronto;
      return prontos > 0 ? `${prontos} pronto${prontos > 1 ? 's' : ''}` : null;
    }
    case 'workspace':
      return null;
  }
}

export function TabStrip() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { tabs, activeIndex, activate, close } = useWorkbenchTabsContext();
  const projetos = useProjetos();

  const projetoDaAba = (tab: WorkbenchTab) => projetos.data?.find((p) => p.id === tab.projetoId);

  const onSelect = (index: number) => {
    activate(index);
    navigate(tabPath(tabs[index]));
  };

  const onClose = (index: number) => {
    const fechandoAtiva = index === activeIndex;
    close(index);
    if (!fechandoAtiva) return;
    const restantes = tabs.filter((_, i) => i !== index);
    if (restantes.length === 0) {
      navigate('/projetos');
      return;
    }
    const proxima = restantes[Math.max(0, index - 1)];
    navigate(tabPath(proxima));
  };

  return (
    <div className="flex flex-none items-end gap-1 bg-[var(--wb-bg-strip)] px-3 pt-2">
      <div
        className="mb-1.5 flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]"
        aria-hidden
      >
        <Scissors size={14} />
      </div>

      <div role="tablist" aria-label="Abas de trabalho" className="flex min-w-0 items-end gap-1">
        {tabs.map((tab, index) => {
          const ativa = index === activeIndex;
          const projeto = projetoDaAba(tab);
          const progresso = progressoDaAba(tab, projeto);
          const rotulo = projeto
            ? rotuloCurtoProjeto(projeto.titulo_live)
            : tab.projetoId.slice(0, 6);
          return (
            <div
              key={`${tab.projetoId}:${tab.etapa}`}
              role="tab"
              aria-selected={ativa}
              tabIndex={0}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSelect(index);
              }}
              className={cn(
                'group flex min-w-0 cursor-pointer items-center gap-2 rounded-t-[10px] px-3.5 py-2',
                ativa
                  ? 'bg-[var(--wb-bg)] text-[var(--wb-text)]'
                  : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
              title={projeto?.titulo_live}
            >
              <span
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: ETAPA_DOT_TOKENS[tab.etapa] }}
                aria-hidden
              />
              <span
                className={cn(
                  'whitespace-nowrap text-[11.5px]',
                  ativa ? 'font-bold' : 'font-semibold',
                )}
              >
                {rotulo} · {ETAPA_LABELS[tab.etapa]}
              </span>
              {progresso && (
                <span className="font-code text-[9.5px] font-semibold text-[var(--wb-text-dim)]">
                  {progresso}
                </span>
              )}
              <button
                type="button"
                aria-label={`Fechar aba ${ETAPA_LABELS[tab.etapa]}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(index);
                }}
                className="rounded p-0.5 text-[var(--wb-text-dim)] opacity-0 transition-opacity hover:text-[var(--wb-text)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Nova aba (escolher projeto na Biblioteca)"
        title="Nova aba — escolher projeto na Biblioteca"
        onClick={() => navigate('/projetos')}
        className="px-2.5 py-1.5 text-[13px] font-bold text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
      >
        <Plus size={14} aria-hidden />
      </button>

      <div className="flex-1" />

      <div
        className="mb-1.5 hidden items-center gap-2 rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--wb-text-mute)] md:flex"
        title="Paleta de comandos (Ctrl+K) — chega na etapa de atalhos"
      >
        <Search size={11} aria-hidden />
        <span className="font-normal text-[var(--wb-text-dim)]">
          ir para projeto, etapa, corte…
        </span>
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Alternar tema"
        title="Alternar tema"
        className="mb-1.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
      >
        {theme === 'light' ? <Moon size={13} aria-hidden /> : <Sun size={13} aria-hidden />}
      </button>
    </div>
  );
}
