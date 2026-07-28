import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useProjetos } from '@/hooks/useProjetos';
import { useCortesProjeto } from '@/hooks/useEditor';
import type { Projeto } from '@/types/models';
import { useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import {
  ETAPA_DOT_TOKENS,
  ETAPA_LABELS,
  globalTabInfo,
  rotuloCurtoProjeto,
  tabPath,
} from './workbenchRoutes';
import {
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  isHomeTab,
  moveTab,
  tabKey,
  activateTab,
  type TabsState,
  type WorkbenchTab,
} from './useWorkbenchTabs';

// ─────────────────────────────────────────────────────────────
// TabStrip — faixa de abas de trabalho no topo do shell
// (DE-PARA §0). D-427: a aba mostra o corte a que está amarrada
// ("267 · C12 · Pós") e ganha as ações do VSCode — arrastar para
// reordenar, menu de contexto (fechar / outras / à direita /
// todas) e um botão de fechar todas na própria faixa.
// ─────────────────────────────────────────────────────────────

/** Chip de progresso da aba, derivado dos contadores do Projeto. */
export function progressoDaAba(tab: WorkbenchTab, projeto: Projeto | undefined): string | null {
  if (!projeto || tab.kind !== 'projeto') return null;
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
        <div className="absolute left-0 top-full z-50 mt-1 w-[300px] rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2 shadow-[shadow:var(--wb-shadow)]">
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

interface MenuContexto {
  index: number;
  x: number;
  y: number;
}

interface AcoesDeAba {
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onMenu: (menu: MenuContexto) => void;
  onMover: (de: number, para: number) => void;
}

interface AbaProps extends AcoesDeAba {
  tab: WorkbenchTab;
  index: number;
  ativa: boolean;
  projeto: Projeto | undefined;
}

/** Rótulo e tooltip de uma aba já resolvidos contra os dados do backend. */
function useRotuloDaAba(tab: WorkbenchTab, projeto: Projeto | undefined) {
  // Só busca a lista de cortes quando a aba está amarrada a um: o
  // React Query deduplica entre abas do mesmo projeto e com as telas.
  const cortes = useCortesProjeto(tab.kind === 'projeto' && tab.corteId ? tab.projetoId : undefined);

  if (tab.kind === 'global') {
    const info = globalTabInfo(tab.global);
    return { texto: info.label, prefixo: info.emoji, titulo: info.label, dot: null };
  }

  const live = projeto ? rotuloCurtoProjeto(projeto.titulo_live) : tab.projetoId.slice(0, 6);
  const corte = cortes.data?.find((item) => item.id === tab.corteId);
  const marcaCorte = tab.corteId ? ` · C${corte?.numero ?? '?'}` : '';
  const titulo = [projeto?.titulo_live, corte && `C${corte.numero} — ${corte.titulo_proposto}`]
    .filter(Boolean)
    .join(' · ');

  return {
    texto: `${live}${marcaCorte} · ${ETAPA_LABELS[tab.etapa]}`,
    prefixo: null,
    titulo: titulo || undefined,
    dot: ETAPA_DOT_TOKENS[tab.etapa],
  };
}

function Aba({ tab, index, ativa, projeto, onSelect, onClose, onMenu, onMover }: AbaProps) {
  const { texto, prefixo, titulo, dot } = useRotuloDaAba(tab, projeto);
  const progresso = progressoDaAba(tab, projeto);
  const home = isHomeTab(tab);

  return (
    <div
      role="tab"
      aria-selected={ativa}
      tabIndex={0}
      draggable={!home}
      onDragStart={(event) => event.dataTransfer.setData('text/wb-tab', String(index))}
      onDragOver={(event) => {
        if (!home && event.dataTransfer.types.includes('text/wb-tab')) event.preventDefault();
      }}
      onDrop={(event) => {
        const origem = Number(event.dataTransfer.getData('text/wb-tab'));
        if (Number.isInteger(origem)) onMover(origem, index);
      }}
      onClick={() => onSelect(index)}
      // Clique do meio fecha, como no VSCode e no navegador.
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          onClose(index);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ index, x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect(index);
      }}
      className={cn(
        'group flex min-w-0 flex-none cursor-pointer items-center gap-2 rounded-t-[10px] px-3.5 py-2',
        ativa
          ? 'bg-[var(--wb-bg)] text-[var(--wb-text)]'
          : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
      title={titulo}
    >
      {dot && (
        <span
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: dot }}
          aria-hidden
        />
      )}
      {prefixo && (
        <span className="flex-none text-[12px] leading-none" aria-hidden>
          {prefixo}
        </span>
      )}
      <span
        className={cn('whitespace-nowrap text-[11.5px]', ativa ? 'font-bold' : 'font-semibold')}
      >
        {texto}
      </span>
      {progresso && (
        <span className="font-code text-[9.5px] font-semibold text-[var(--wb-text-dim)]">
          {progresso}
        </span>
      )}
      {!home && (
        <button
          type="button"
          aria-label={`Fechar aba ${texto}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose(index);
          }}
          className="rounded p-0.5 text-[var(--wb-text-dim)] opacity-0 transition-opacity hover:text-[var(--wb-text)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={11} aria-hidden />
        </button>
      )}
    </div>
  );
}

interface MenuDeAbaProps {
  menu: MenuContexto;
  total: number;
  onFechar: () => void;
  onAcao: (acao: 'fechar' | 'outras' | 'direita' | 'todas') => void;
}

function MenuDeAba({ menu, total, onFechar, onAcao }: MenuDeAbaProps) {
  useEffect(() => {
    const sair = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      onFechar();
    };
    document.addEventListener('mousedown', sair);
    document.addEventListener('keydown', sair);
    return () => {
      document.removeEventListener('mousedown', sair);
      document.removeEventListener('keydown', sair);
    };
  }, [onFechar]);

  const itens = [
    { acao: 'fechar' as const, label: 'Fechar', off: menu.index === 0 },
    { acao: 'outras' as const, label: 'Fechar as outras', off: total <= 2 },
    { acao: 'direita' as const, label: 'Fechar à direita', off: menu.index >= total - 1 },
    { acao: 'todas' as const, label: 'Fechar todas', off: total <= 1 },
  ];

  return (
    <div
      role="menu"
      aria-label="Ações da aba"
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[60] min-w-[172px] rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-1 shadow-[shadow:var(--wb-shadow)]"
    >
      {itens.map((item) => (
        <button
          key={item.acao}
          type="button"
          role="menuitem"
          disabled={item.off}
          onClick={() => onAcao(item.acao)}
          className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-semibold text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TabStrip() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { state, tabs, activeIndex, replace, prune } = useWorkbenchTabsContext();
  const projetos = useProjetos();
  const [menu, setMenu] = useState<MenuContexto | null>(null);

  // D-394: abas fantasmas (projeto removido / banco trocado) fecham
  // sozinhas assim que a lista real de projetos chega.
  const projetosData = projetos.data;
  useEffect(() => {
    if (!projetosData) return;
    prune(new Set(projetosData.map((p) => p.id)));
  }, [projetosData, prune]);

  const projetoDaAba = (tab: WorkbenchTab) =>
    tab.kind === 'projeto' ? projetos.data?.find((p) => p.id === tab.projetoId) : undefined;

  /** Aplica um estado calculado pelas funções puras e segue a aba que ficou ativa. */
  const aplicar = (proximo: TabsState) => {
    if (proximo === state) return;
    replace(proximo);
    const alvo = proximo.tabs[proximo.activeIndex];
    if (alvo) navigate(tabPath(alvo));
  };

  const acoes: AcoesDeAba = {
    onSelect: (index) => aplicar(activateTab(state, index)),
    onClose: (index) => aplicar(closeTab(state, index)),
    onMenu: setMenu,
    onMover: (de, para) => aplicar(moveTab(state, de, para)),
  };

  const executarMenu = (acao: 'fechar' | 'outras' | 'direita' | 'todas') => {
    if (!menu) return;
    const { index } = menu;
    setMenu(null);
    if (acao === 'fechar') return aplicar(closeTab(state, index));
    if (acao === 'outras') return aplicar(closeOtherTabs(state, index));
    if (acao === 'direita') return aplicar(closeTabsToRight(state, index));
    return aplicar(closeAllTabs());
  };

  return (
    <div className="flex flex-none items-end gap-1 bg-[var(--wb-bg-strip)] px-3 pt-2">
      <div
        className="mb-1.5 flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-[var(--wb-accent)] font-code text-[12px] font-bold text-[var(--wb-accent-fg)]"
        aria-hidden
      >
        ✂
      </div>

      <div
        role="tablist"
        aria-label="Abas de trabalho"
        className="flex min-w-0 items-end gap-1 overflow-x-auto"
      >
        {tabs.map((tab, index) => (
          <Aba
            key={tabKey(tab)}
            tab={tab}
            index={index}
            ativa={index === activeIndex}
            projeto={projetoDaAba(tab)}
            {...acoes}
          />
        ))}
      </div>

      <NovaAbaMenu
        onEscolher={(projetoId) =>
          navigate(tabPath({ kind: 'projeto', projetoId, etapa: 'workspace' }))
        }
      />

      <button
        type="button"
        aria-label="Fechar todas as guias"
        title="Fechar todas as guias (volta para a Biblioteca)"
        disabled={tabs.length <= 1}
        onClick={() => aplicar(closeAllTabs())}
        className="mb-1.5 flex h-7 flex-none items-center gap-1 rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[10.5px] font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <X size={11} aria-hidden />
        <span className="hidden lg:inline">Fechar todas</span>
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
        className="mb-1.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
      >
        <span aria-hidden>{theme === 'light' ? '🌙' : '☀️'}</span>
      </button>

      {menu && (
        <MenuDeAba
          menu={menu}
          total={tabs.length}
          onFechar={() => setMenu(null)}
          onAcao={executarMenu}
        />
      )}
    </div>
  );
}
