import { useEffect, useState } from 'react';
import { Pin } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn, thumbnailUrl } from '@/lib/utils';
import { useProjetos } from '@/hooks/useProjetos';
import { PipelineProgress } from '@/features/projetos/PipelineProgress';
import type { Projeto } from '@/types/models';
import { useProjetosFixados } from './useProjetosFixados';
import { useWorkbenchPanelsContext } from './WorkbenchPanelsProvider';
import { useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { rotuloCurtoProjeto, tabPath } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// ProjectRail — rail de projetos ativos à esquerda (DE-PARA §0).
// Card por projeto fixado, com aba aberta ou pipeline em andamento
// (thumb 40×24, título, mini-pipeline). Rodapé: navegação global.
// ─────────────────────────────────────────────────────────────

const STATUS_EM_ANDAMENTO = new Set(['baixando', 'transcrevendo', 'analisando']);

export interface SelecaoDoRail {
  projetos: Projeto[];
  /** Ids com aba de trabalho aberta. */
  abertosIds: readonly string[];
  /** Ids fixados pelo usuário, na ordem de fixação (D-400). */
  fixadosIds: readonly string[];
  limite?: number;
}

/**
 * Projetos exibidos no rail: fixados primeiro (independente de aba ou
 * status), depois os com aba aberta e por fim os em processamento.
 */
export function projetosDoRail({
  projetos,
  abertosIds,
  fixadosIds,
  limite = 8,
}: SelecaoDoRail): Projeto[] {
  const porId = new Map(projetos.map((p) => [p.id, p]));
  const doRail: Projeto[] = [];
  const incluir = (projeto: Projeto | undefined) => {
    if (projeto && !doRail.includes(projeto)) doRail.push(projeto);
  };

  for (const id of fixadosIds) incluir(porId.get(id));
  for (const id of abertosIds) incluir(porId.get(id));
  for (const projeto of projetos) {
    if (doRail.length >= limite) break;
    if (STATUS_EM_ANDAMENTO.has(projeto.status)) incluir(projeto);
  }
  return doRail.slice(0, limite);
}

interface GlobalNavItem {
  to: string;
  label: string;
  /** Ícone do protótipo Workbench 1c (validação 1: usar os do design). */
  emoji: string;
  /** Divisor acima do item (protótipo separa Atalhos/Configurações). */
  divisor?: boolean;
}

const GLOBAL_NAV: GlobalNavItem[] = [
  { to: '/projetos', label: 'Biblioteca', emoji: '🏠' },
  { to: '/ranking-lives', label: 'Ranking de lives', emoji: '🏆' },
  { to: '/buscar-lives', label: 'Buscar lives', emoji: '📡' },
  { to: '/padroes-thumbnail', label: 'Padrões de thumbnail', emoji: '✨' },
  { to: '/analises', label: 'Análises', emoji: '📊' },
  { to: '/atalhos', label: 'Atalhos', emoji: '⌨', divisor: true },
  { to: '/canais', label: 'Configurações', emoji: '⚙' },
];

/** Alterna o pin do projeto sem disparar o clique de abrir o card. */
function BotaoFixar({
  titulo,
  fixado,
  onFixar,
}: {
  titulo: string;
  fixado: boolean;
  onFixar: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={fixado ? `Desafixar ${titulo}` : `Fixar ${titulo} no rail`}
      aria-pressed={fixado}
      title={fixado ? 'Desafixar projeto' : 'Fixar projeto no topo do rail'}
      onClick={(event) => {
        event.stopPropagation();
        onFixar();
      }}
      className={cn(
        'ml-auto flex-none rounded p-0.5 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        // Solto fica discreto (mas sempre visível — é ação pedida, não atalho
        // escondido); no hover do card e ao focar, acende.
        fixado
          ? 'text-[var(--wb-accent)]'
          : 'text-[var(--wb-text-dim)] opacity-60 hover:text-[var(--wb-text)] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100',
      )}
    >
      <Pin size={12} fill={fixado ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}

interface RailCardProps {
  projeto: Projeto;
  open: boolean;
  fixado: boolean;
  onFixar: () => void;
}

export function RailCard({ projeto, open, fixado, onFixar }: RailCardProps) {
  const navigate = useNavigate();
  const { activeTab } = useWorkbenchTabsContext();
  const [thumbErr, setThumbErr] = useState(false);
  const thumb = thumbnailUrl(projeto.youtube_url, 'mq');
  const ativo = activeTab?.projetoId === projeto.id;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir workspace de ${projeto.titulo_live}`}
      title={projeto.titulo_live}
      onClick={() => navigate(tabPath({ projetoId: projeto.id, etapa: 'workspace' }))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(tabPath({ projetoId: projeto.id, etapa: 'workspace' }));
      }}
      className={cn(
        'group cursor-pointer rounded-[10px] border p-2 transition-colors',
        ativo
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] hover:border-[var(--wb-text-dim)]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative h-6 w-10 flex-none">
          {thumb && !thumbErr ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              onError={() => setThumbErr(true)}
              className="h-6 w-10 rounded object-cover"
            />
          ) : (
            <span className="block h-6 w-10 rounded bg-[var(--wb-bg-inset)]" aria-hidden />
          )}
          {/* Rail colapsado esconde o botão: o ponto avisa que o projeto está fixado. */}
          {fixado && !open && (
            <span
              role="img"
              aria-label="Projeto fixado"
              title="Projeto fixado"
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--wb-accent)]"
            />
          )}
        </span>
        {open && (
          <div className="min-w-0 text-[10.5px] leading-tight">
            <div className="truncate font-bold">LIVE {rotuloCurtoProjeto(projeto.titulo_live)}</div>
            <div className="truncate text-[var(--wb-text-mute)]">{projeto.titulo_live}</div>
          </div>
        )}
        {open && <BotaoFixar titulo={projeto.titulo_live} fixado={fixado} onFixar={onFixar} />}
      </div>
      {open && (
        <div className="mt-2">
          <PipelineProgress projeto={projeto} compact />
        </div>
      )}
    </div>
  );
}

export function ProjectRail() {
  const { pathname } = useLocation();
  const { effective, widthOf, toggle } = useWorkbenchPanelsContext();
  const { tabs } = useWorkbenchTabsContext();
  const projetos = useProjetos();
  const { fixados, isFixado, toggle: toggleFixado, prune: prunePins } = useProjetosFixados();

  // Pins de projetos removidos (ou de outro banco) somem sozinhos assim
  // que a lista real chega — mesmo tratamento das abas fantasmas (D-394).
  const projetosData = projetos.data;
  useEffect(() => {
    if (!projetosData) return;
    prunePins(new Set(projetosData.map((p) => p.id)));
  }, [projetosData, prunePins]);

  const open = effective.rail;
  const abertosIds = [...new Set(tabs.map((tab) => tab.projetoId))];
  const doRail = projetosDoRail({
    projetos: projetosData ?? [],
    abertosIds,
    fixadosIds: fixados,
  });

  return (
    <aside
      aria-label="Projetos ativos"
      className="flex flex-none flex-col overflow-hidden border-r border-[var(--wb-border)] bg-[var(--wb-bg-panel)] transition-[width] duration-[220ms] ease-[ease]"
      style={{ width: widthOf('rail') }}
    >
      <div className="flex flex-none items-center justify-between px-2.5 pb-1.5 pt-2.5">
        {open && (
          <span className="whitespace-nowrap font-code text-[9px] font-extrabold tracking-[0.14em] text-[var(--wb-text-dim)]">
            PROJETOS ATIVOS
          </span>
        )}
        <button
          type="button"
          onClick={() => toggle('rail')}
          aria-label={open ? 'Recolher rail de projetos' : 'Expandir rail de projetos'}
          className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[var(--wb-bg-inset)] text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
        >
          <span aria-hidden>{open ? '◀' : '▶'}</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5">
        {doRail.map((projeto) => (
          <RailCard
            key={projeto.id}
            projeto={projeto}
            open={open}
            fixado={isFixado(projeto.id)}
            onFixar={() => toggleFixado(projeto.id)}
          />
        ))}
        {open && doRail.length === 0 && !projetos.isLoading && (
          <p className="px-1 text-[10px] text-[var(--wb-text-dim)]">
            Abra um projeto na Biblioteca para ele aparecer aqui.
          </p>
        )}
      </div>

      <nav
        aria-label="Navegação global"
        className="flex flex-none flex-col gap-1.5 border-t border-[var(--wb-border)] p-2.5"
      >
        {GLOBAL_NAV.map(({ to, label, emoji, divisor }) => {
          const ativo = pathname === to || (to !== '/projetos' && pathname.startsWith(to));
          return (
            <span key={to} className="contents">
              {divisor && <span aria-hidden className="my-0.5 h-px bg-[var(--wb-border)]" />}
              <Link
                to={to}
                aria-label={label}
                title={label}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-md px-1.5 py-1.5 text-[12px] font-semibold',
                  ativo
                    ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                    : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
                )}
              >
                <span
                  className="w-[22px] flex-none text-center text-[17px] leading-none"
                  aria-hidden
                >
                  {emoji}
                </span>
                {open && <span>{label}</span>}
              </Link>
            </span>
          );
        })}
      </nav>
    </aside>
  );
}
