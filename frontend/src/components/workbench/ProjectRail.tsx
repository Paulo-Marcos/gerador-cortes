import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Home,
  Keyboard,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { cn, thumbnailUrl } from '@/lib/utils';
import { useProjetos } from '@/hooks/useProjetos';
import { PipelineProgress } from '@/features/projetos/PipelineProgress';
import type { Projeto } from '@/types/models';
import { useWorkbenchPanelsContext } from './WorkbenchPanelsProvider';
import { useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { rotuloCurtoProjeto, tabPath } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// ProjectRail — rail de projetos ativos à esquerda (DE-PARA §0).
// Card por projeto com aba aberta ou pipeline em andamento
// (thumb 40×24, título, mini-pipeline). Rodapé: navegação global.
// ─────────────────────────────────────────────────────────────

const STATUS_EM_ANDAMENTO = new Set(['baixando', 'transcrevendo', 'analisando']);

/** Projetos exibidos no rail: com aba aberta primeiro, depois os em processamento. */
export function projetosDoRail(
  projetos: Projeto[],
  abertosIds: readonly string[],
  limite = 8,
): Projeto[] {
  const porId = new Map(projetos.map((p) => [p.id, p]));
  const doRail: Projeto[] = [];
  for (const id of abertosIds) {
    const projeto = porId.get(id);
    if (projeto && !doRail.includes(projeto)) doRail.push(projeto);
  }
  for (const projeto of projetos) {
    if (doRail.length >= limite) break;
    if (STATUS_EM_ANDAMENTO.has(projeto.status) && !doRail.includes(projeto)) doRail.push(projeto);
  }
  return doRail.slice(0, limite);
}

interface GlobalNavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

const GLOBAL_NAV: GlobalNavItem[] = [
  { to: '/projetos', label: 'Biblioteca', Icon: Home },
  { to: '/ranking-lives', label: 'Ranking de lives', Icon: Trophy },
  { to: '/buscar-lives', label: 'Buscar lives', Icon: Radio },
  { to: '/padroes-thumbnail', label: 'Padrões de thumbnail', Icon: Sparkles },
  { to: '/analises', label: 'Análises', Icon: BarChart3 },
  { to: '/atalhos', label: 'Atalhos', Icon: Keyboard },
  { to: '/canais', label: 'Configurações', Icon: SlidersHorizontal },
];

function RailCard({ projeto, open }: { projeto: Projeto; open: boolean }) {
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
        'cursor-pointer rounded-[10px] border p-2 transition-colors',
        ativo
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] hover:border-[var(--wb-text-dim)]',
      )}
    >
      <div className="flex items-center gap-2">
        {thumb && !thumbErr ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setThumbErr(true)}
            className="h-6 w-10 flex-none rounded object-cover"
          />
        ) : (
          <span className="h-6 w-10 flex-none rounded bg-[var(--wb-bg-inset)]" aria-hidden />
        )}
        {open && (
          <div className="min-w-0 text-[10.5px] leading-tight">
            <div className="truncate font-bold">LIVE {rotuloCurtoProjeto(projeto.titulo_live)}</div>
            <div className="truncate text-[var(--wb-text-mute)]">{projeto.titulo_live}</div>
          </div>
        )}
      </div>
      {open && (
        <div className="mt-2">
          <PipelineProgress projeto={projeto} />
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

  const open = effective.rail;
  const Chevron = open ? ChevronLeft : ChevronRight;
  const abertosIds = [...new Set(tabs.map((tab) => tab.projetoId))];
  const doRail = projetosDoRail(projetos.data ?? [], abertosIds);

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
          className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
        >
          <Chevron size={12} aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5">
        {doRail.map((projeto) => (
          <RailCard key={projeto.id} projeto={projeto} open={open} />
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
        {GLOBAL_NAV.map(({ to, label, Icon }) => {
          const ativo = pathname === to || (to !== '/projetos' && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              title={label}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-md px-1.5 py-1 text-[10.5px] font-semibold',
                ativo
                  ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                  : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              <Icon size={14} className="flex-none" aria-hidden />
              {open && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
