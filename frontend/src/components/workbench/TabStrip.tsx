import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
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

/** Dropdown do ＋: escolher um projeto abre a aba do workspace dele. */
function NovaAbaMenu({ onEscolher }: { onEscolher: (projetoId: string) => void }) {
  const projetos = useProjetos();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const raiz = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: MouseEvent) => {
      if (!raiz.current?.contains(event.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const lista = (projetos.data ?? []).filter((p) =>
    p.titulo_live.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label="Nova aba de trabalho"
        aria-expanded={aberto}
        title="Nova aba — escolher projeto"
        onClick={() => setAberto((v) => !v)}
        className="px-2.5 py-1.5 text-[14px] font-bold text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
      >
        ＋
      </button>
      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[300px] rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2 shadow-[var(--wb-shadow)]">
          <input
            autoFocus
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="buscar projeto…"
            className="mb-1.5 w-full rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2 py-1 text-[11px] text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
          />
          <div className="max-h-[260px] overflow-y-auto">
            {lista.slice(0, 20).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setAberto(false);
                  setBusca('');
                  onEscolher(p.id);
                }}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
                title={p.titulo_live}
              >
                {p.titulo_live}
              </button>
            ))}
            {lista.length === 0 && (
              <p className="px-2 py-2 text-[10.5px] text-[var(--wb-text-dim)]">
                Nenhum projeto encontrado.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TabStrip() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { tabs, activeIndex, activate, close, prune } = useWorkbenchTabsContext();
  const projetos = useProjetos();

  // D-394: abas fantasmas (projeto removido / banco trocado) fecham
  // sozinhas assim que a lista real de projetos chega.
  const projetosData = projetos.data;
  useEffect(() => {
    if (!projetosData) return;
    prune(new Set(projetosData.map((p) => p.id)));
  }, [projetosData, prune]);

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
        className="mb-1.5 flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-[var(--wb-accent)] font-code text-[12px] font-bold text-[var(--wb-accent-fg)]"
        aria-hidden
      >
        ✂
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

      <NovaAbaMenu
        onEscolher={(projetoId) => navigate(tabPath({ projetoId, etapa: 'workspace' }))}
      />

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
        className="mb-1.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
      >
        <span aria-hidden>{theme === 'light' ? '🌙' : '☀️'}</span>
      </button>
    </div>
  );
}
