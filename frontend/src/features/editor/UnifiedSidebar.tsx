import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Folder,
  Plus,
  Rocket,
  Scissors,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import type { Corte, StatusExportCorte } from '@/types/models';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { CorteStatusCard } from './CorteStatusCard';
import { AdicionarCorteModal } from './AdicionarCorteModal';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import { moverCorte, useReordenarCortes } from '@/hooks/useEditor';

// ─────────────────────────────────────────────────────────────
// UnifiedSidebar — replica `design_reference/src/v2_shell.jsx:278-379`.
// Diferencas vs design (decisao Paulo, registradas em docs/feature-f024):
//   1. Nao mostra Biblio/Captura (no design aparecem nas linhas 319-320).
//      Em editor o foco e na lista de cortes; logo Film vira atalho para
//      /projetos (pagina principal de projetos).
//   2. Largura, espacos verticais, tipografia, cores, estado ativo (barra
//      de acento a esquerda, bg accent-soft) — fiel ao design.
// ─────────────────────────────────────────────────────────────

export type EditorPhase = 'editor' | 'pos' | 'final';

interface UnifiedSidebarProps {
  projetoId: string;
  cortes: Corte[];
  corteAtivoId: string;
  exportStatus: StatusExportCorte[];
  activePhase: EditorPhase;
  /** Resolve a URL de destino quando o usuario clica num corte da lista.
   *  Default = /projetos/:id/cortes/:corteId (Bruto). */
  getCortePath?: (corte: Corte) => string;
  onOpenSettings: () => void;
}

const APROVADO_STATUS = new Set<Corte['status']>(['aprovado', 'editado', 'processado']);

interface SinalFlags {
  aprovado: boolean;
  rejeitado: boolean;
  fire: boolean;
  leitura: boolean;
}

function tintarFundo(flags: SinalFlags, ativo: boolean): string | undefined {
  const sfx = ativo ? '' : '-soft';
  if (flags.rejeitado) return `var(--tint-rejeitado${sfx})`;
  const stops: string[] = [];
  if (flags.aprovado) stops.push(`var(--tint-aprovado${sfx})`);
  if (flags.fire) stops.push(`var(--tint-fire${sfx})`);
  if (flags.leitura) stops.push(`var(--tint-leitura${sfx})`);
  if (stops.length === 0) return undefined;
  if (stops.length === 1) return stops[0];
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

// ── NavItem · v2_shell.jsx:38-100 ────────────────────────────
// 60x52, icone 17px + label 9.5px, ativo = bg-accent-soft + barra 3px
// a esquerda. Highlight = fundo --wb-ink + texto --wb-ink-fg (Studio).
interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  highlight?: boolean;
  to?: string;
  tooltip?: string;
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  highlight = false,
  to,
  tooltip,
}: NavItemProps) {
  const className = cn(
    'group relative flex h-[52px] w-[60px] flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
    highlight && 'bg-[var(--wb-ink)] text-[var(--wb-ink-fg)] hover:opacity-95',
    !highlight && active && 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]',
    !highlight &&
      !active &&
      'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
  );

  const content: ReactNode = (
    <>
      {active && !highlight && (
        <span
          aria-hidden
          className="absolute left-[-8px] top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--wb-accent)]"
        />
      )}
      <Icon size={17} strokeWidth={active || highlight ? 2 : 1.7} aria-hidden />
      <span
        className={cn(
          'text-[9.5px] leading-none',
          active || highlight ? 'font-bold' : 'font-medium',
        )}
        style={{ letterSpacing: '-0.005em' }}
      >
        {label}
      </span>
    </>
  );

  if (!to) {
    return (
      <Tooltip label={tooltip ?? label} side="right">
        <button type="button" className={className} aria-label={label}>
          {content}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={tooltip ?? label} side="right">
      <Link
        to={to}
        className={className}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
      >
        {content}
      </Link>
    </Tooltip>
  );
}

function Divider() {
  // v2_shell.jsx:318/321 — 32px width, 1px tall, --wb-border-soft.
  return <div className="my-1.5 h-px w-8 bg-[var(--wb-border-soft)]" aria-hidden />;
}

export function UnifiedSidebar({
  projetoId,
  cortes,
  corteAtivoId,
  exportStatus,
  activePhase,
  getCortePath,
  onOpenSettings,
}: UnifiedSidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  const statusMap = new Map(exportStatus.map((s) => [s.corte_id, s] as const));
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [metaCorte, setMetaCorte] = useState<Corte | null>(null);
  const reordenar = useReordenarCortes(projetoId);

  function mover(corteId: string, delta: -1 | 1) {
    const novaOrdem = moverCorte(cortes, corteId, delta);
    if (novaOrdem) reordenar.mutate(novaOrdem);
  }

  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, [corteAtivoId, cortes.length]);

  const matchProjetoDetalhe = useMatch('/projetos/:id');
  const matchProjetoFilho = useMatch('/projetos/:id/*');
  const projetoIdAtivo =
    matchProjetoFilho?.params.id ?? matchProjetoDetalhe?.params.id ?? projetoId;
  const studioPath = projetoIdAtivo ? `/projetos/${projetoIdAtivo}` : '/projetos';

  // Decide se cada fase esta ativa pela rota corrente (mais robusto que o
  // activePhase, ja que a navegacao pode mudar antes do componente pai
  // re-renderizar).
  const isBrutoActive = activePhase === 'editor' || /\/cortes(?:\/|$)/.test(pathname);
  const isPosActive = activePhase === 'pos' || /\/(post-production|export)(?:\/|$)/.test(pathname);
  const isFinalActive = activePhase === 'final' || /\/final-review(?:\/|$)/.test(pathname);

  return (
    <aside
      aria-label="Navegacao do editor"
      className="fixed left-0 top-0 z-40 flex h-screen w-[132px] flex-col border-r border-[var(--wb-border)] bg-[var(--wb-bg-panel)]"
    >
      {/* Logo — v2_shell.jsx:291-307. Link para /projetos (decisao Paulo) */}
      <div className="flex flex-shrink-0 justify-center px-2.5 pb-2 pt-3">
        <Link
          to="/projetos"
          aria-label="Pagina principal"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--wb-ink)] text-[var(--wb-ink-fg)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
        >
          <Film size={20} aria-hidden />
        </Link>
      </div>

      {/* Nav: Studio (highlight) + divisor + fases — v2_shell.jsx:310-325.
          Biblio/Captura removidos (decisao Paulo). */}
      <div className="flex flex-shrink-0 flex-col items-center gap-0.5 px-1.5">
        <NavItem
          icon={Folder}
          label="Studio"
          highlight
          to={studioPath}
          tooltip="Voltar ao Studio (workspace do projeto)"
        />
        <Divider />
        <NavItem
          icon={Scissors}
          label="Bruto"
          active={isBrutoActive}
          to={
            projetoIdAtivo
              ? corteAtivoId
                ? `/projetos/${projetoIdAtivo}/cortes/${corteAtivoId}`
                : `/projetos/${projetoIdAtivo}/cortes`
              : undefined
          }
        />
        <NavItem
          icon={Rocket}
          label="Pos"
          active={isPosActive}
          to={
            projetoIdAtivo
              ? corteAtivoId
                ? `/projetos/${projetoIdAtivo}/post-production?corte=${corteAtivoId}`
                : `/projetos/${projetoIdAtivo}/post-production`
              : undefined
          }
        />
        <NavItem
          icon={Check}
          label="Final"
          active={isFinalActive}
          to={
            projetoIdAtivo
              ? corteAtivoId
                ? `/projetos/${projetoIdAtivo}/final-review?corte=${corteAtivoId}`
                : `/projetos/${projetoIdAtivo}/final-review`
              : undefined
          }
        />
      </div>

      {/* Header CORTES · N — v2_shell.jsx:328-344.
          F-056: botao "+" inline para criar corte manualmente. */}
      <div className="mt-2 flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-[var(--wb-border-soft)] px-2 pb-2 pt-3.5">
        <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--wb-text-dim)]">
          Cortes · {cortes.length}
        </span>
        {projetoIdAtivo && (
          <Tooltip label="Adicionar corte manualmente" side="right">
            <button
              type="button"
              onClick={() => setAdicionarOpen(true)}
              aria-label="Adicionar corte manualmente"
              className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-xs)] text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
            >
              <Plus size={11} strokeWidth={2.4} aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>

      {projetoIdAtivo && (
        <AdicionarCorteModal
          open={adicionarOpen}
          onClose={() => setAdicionarOpen(false)}
          projetoId={projetoIdAtivo}
          onCreated={(corte) =>
            navigate(getCortePath?.(corte) ?? `/projetos/${projetoIdAtivo}/cortes/${corte.id}`)
          }
        />
      )}

      {projetoIdAtivo && metaCorte && (
        <MetadataModal
          open
          projetoId={projetoIdAtivo}
          corte={metaCorte}
          onClose={() => setMetaCorte(null)}
        />
      )}

      {/* Lista de cortes — v2_shell.jsx:346-360. Preserva CorteStatusCard
          existente (medalhao + meta strip + sinais). */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-2">
        {cortes.map((corte, idx) => {
          const ativo = corte.id === corteAtivoId;
          const stat = statusMap.get(corte.id);
          const publicado = Boolean(stat?.youtube_url_publicado);
          const flags: SinalFlags = {
            aprovado: APROVADO_STATUS.has(corte.status),
            rejeitado: corte.status === 'rejeitado',
            fire: Boolean(corte.is_fire),
            leitura: Boolean(corte.is_leitura),
          };
          const tintBackground = tintarFundo(flags, ativo);
          const inlineStyle: React.CSSProperties | undefined = tintBackground
            ? { background: tintBackground }
            : undefined;
          const podeSubir = idx > 0;
          const podeDescer = idx < cortes.length - 1;

          return (
            <div
              key={corte.id}
              ref={ativo ? activeCardRef : undefined}
              style={inlineStyle}
              className={cn(
                'group relative flex w-full flex-col items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-2 transition-colors',
                !tintBackground && 'hover:bg-[var(--wb-bg-inset)]',
                ativo
                  ? cn(
                      'border-[var(--wb-border)] shadow-sm',
                      !tintBackground && 'bg-[var(--wb-bg-card)]',
                    )
                  : 'border-transparent',
              )}
            >
              {ativo && (
                <span
                  aria-hidden
                  className="absolute left-[-7px] top-3 bottom-3 w-[3px] rounded-r-full bg-[var(--wb-accent)]"
                />
              )}

              {/* F-057: setas ↑/↓ aparecem no hover do card (ou enquanto
                  reorder esta pendente) para nao poluir a lista. */}
              <div
                className={cn(
                  'pointer-events-none absolute right-0.5 top-0.5 flex flex-col gap-0.5 transition-opacity',
                  'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
                  reordenar.isPending && 'opacity-100',
                )}
              >
                <button
                  type="button"
                  onClick={() => mover(corte.id, -1)}
                  disabled={!podeSubir || reordenar.isPending}
                  aria-label={`Mover corte ${corte.numero} para cima`}
                  className="pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-bg-card)]/85 text-[var(--wb-text-dim)] shadow-sm hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--wb-bg-card)]/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-focus)]"
                >
                  <ChevronUp size={10} strokeWidth={2.4} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => mover(corte.id, 1)}
                  disabled={!podeDescer || reordenar.isPending}
                  aria-label={`Mover corte ${corte.numero} para baixo`}
                  className="pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-bg-card)]/85 text-[var(--wb-text-dim)] shadow-sm hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--wb-bg-card)]/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-focus)]"
                >
                  <ChevronDown size={10} strokeWidth={2.4} aria-hidden />
                </button>
              </div>

              <CorteStatusCard
                numero={corte.numero}
                titulo={corte.titulo_proposto}
                corteStatus={corte.status}
                status={stat}
                ativo={ativo}
                publicado={publicado}
                isFire={flags.fire}
                isLeitura={flags.leitura}
                onSelect={() =>
                  navigate(getCortePath?.(corte) ?? `/projetos/${projetoId}/cortes/${corte.id}`)
                }
                onOpenMetadata={() => setMetaCorte(corte)}
              />
            </div>
          );
        })}
      </div>

      {/* Rodape: tema + ajustes — v2_shell.jsx:362-376 */}
      <div className="flex flex-shrink-0 items-center justify-center gap-1 border-t border-[var(--wb-border-soft)] px-2 py-2.5">
        <ThemePicker />
        <Tooltip label="Ajustes" side="top">
          <IconButton aria-label="Ajustes" title="Ajustes" onClick={onOpenSettings}>
            <Settings aria-hidden />
          </IconButton>
        </Tooltip>
      </div>
    </aside>
  );
}
