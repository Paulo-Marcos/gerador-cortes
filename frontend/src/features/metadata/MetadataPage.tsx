import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Image, Loader2, RefreshCw, Rocket, Sparkles, Tag } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCortesProjeto } from '@/hooks/useEditor';
import { useExportStatus, useProjeto } from '@/hooks/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { cn, thumbnailUrl } from '@/lib/utils';
import type { Corte, MetadadoCorte, StatusExportCorte } from '@/types/models';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { PublicarMassaModal } from '@/features/projeto-detalhe/PublicarMassaModal';
import { MetadataCard } from './MetadataCard';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

function metadadoStatus(meta?: MetadadoCorte, status?: StatusExportCorte) {
  if (status?.metadados_completos || meta?.titulo_youtube) return 'ready';
  if (meta?.prompt_thumbnail || meta?.texto_capa) return 'partial';
  return 'empty';
}

const CASCA_NOVA = isUpgradeShellEnabled();

export function MetadataPage() {
  const { id: projetoId } = useParams();
  const [searchParams] = useSearchParams();
  // D-427: a aba de trabalho amarrada a um corte chega aqui com `?corte=`
  // — sem isso a tela abriria sempre no primeiro corte do projeto.
  const [activeId, setActiveId] = useState(() => searchParams.get('corte') ?? '');
  const [metaById, setMetaById] = useState<Record<string, MetadadoCorte>>({});
  const [publicarOpen, setPublicarOpen] = useState(false);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const cortesQuery = useCortesProjeto(projetoId);
  const exportQuery = useExportStatus(projetoId);
  const projetoQuery = useProjeto(projetoId);
  const navigate = useNavigate();
  const workbench = isWorkbenchEnabled();

  const cuts = useMemo(
    () =>
      (cortesQuery.data ?? [])
        .filter(
          (cut) =>
            cut.status === 'aprovado' || cut.status === 'processado',
        )
        .sort((a, b) => a.numero - b.numero),
    [cortesQuery.data],
  );

  const statusMap = useMemo(
    () =>
      new Map((exportQuery.data?.cortes ?? []).map((status) => [status.corte_id, status] as const)),
    [exportQuery.data],
  );

  useEffect(() => {
    if (!activeId && cuts[0]) setActiveId(cuts[0].id);
  }, [activeId, cuts]);

  const handleMetaLoaded = useCallback((corteId: string, meta: MetadadoCorte) => {
    setMetaById((current) => ({ ...current, [corteId]: meta }));
  }, []);

  const selectCut = (corteId: string) => {
    setActiveId(corteId);
    requestAnimationFrame(() =>
      refs.current[corteId]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const stats = useMemo(() => {
    const total = cuts.length;
    const ready = cuts.filter(
      (cut) => metadadoStatus(metaById[cut.id], statusMap.get(cut.id)) === 'ready',
    ).length;
    const prompts = cuts.filter((cut) => Boolean(metaById[cut.id]?.prompt_thumbnail)).length;
    const thumbs = cuts.filter((cut) =>
      Boolean(statusMap.get(cut.id)?.thumbnail_pronta || metaById[cut.id]?.thumbnail_path),
    ).length;
    return { total, ready, prompts, thumbs };
  }, [cuts, metaById, statusMap]);

  // Rodapé "PRONTO P/ YOUTUBE X de Y" (DE-PARA §6): prontos = pronto_publicar
  // e ainda não publicados (mesma regra do Workspace).
  const cortesProntos = useMemo(
    () =>
      (exportQuery.data?.cortes ?? []).filter((c) => c.pronto_publicar && !c.youtube_url_publicado),
    [exportQuery.data],
  );

  // D-599: na casca nova a lista de cortes vira a COLUNA DE CONTEXTO, a troca
  // de corte vira o seletor com J/K, e o rodape "PRONTO P/ YOUTUBE" + publicar
  // vira a barra de acoes fixa. O trilho de metricas da direita sai: os mesmos
  // tres numeros ja estao no subtitulo e na barra, e repeti-los numa terceira
  // coluna so estreitava o formulario, que e onde o trabalho acontece.
  const indiceAtivo = cuts.findIndex((c) => c.id === activeId);
  const irParaCorte = (delta: -1 | 1) => {
    if (cuts.length === 0) return;
    const alvo = cuts[(Math.max(0, indiceAtivo) + delta + cuts.length) % cuts.length];
    selectCut(alvo.id);
  };
  const corteAtivo = cuts[indiceAtivo] ?? cuts[0];
  const DOT = { ready: 'var(--ok)', partial: 'var(--warn)', empty: 'var(--dim)' } as const;

  useDefinirChrome(
    {
      titulo: corteAtivo ? `Metadados & capas — Corte #${corteAtivo.numero}` : 'Metadados & capas',
      sub: `${stats.ready} de ${stats.total} cortes prontos · ${stats.prompts} prompts de capa · ${stats.thumbs} capas`,
      // O primeiro slot da trilha de Metadados é a LIVE, o segundo o corte.
      rotulos: [
        projetoQuery.data?.titulo_live ?? 'Live',
        ...(corteAtivo ? [`#${corteAtivo.numero}`] : []),
      ],
      lista:
        cuts.length > 0
          ? {
              cabecalho: {
                titulo: projetoQuery.data?.titulo_live ?? 'Cortes aprovados',
                sub: `${stats.total} cortes · ${stats.ready} prontos`,
                thumb: thumbnailUrl(projetoQuery.data?.youtube_url ?? '', 'mq') ?? undefined,
              },
              titulo: 'Cortes aprovados',
              resumo: `${stats.ready} de ${stats.total} prontos`,
              itens: cuts.map((c) => ({
                id: c.id,
                num: String(c.numero),
                titulo: c.titulo_proposto,
                legenda: `#${c.numero} · ${c.inicio_hms}`,
                thumb: resolveThumbUrl(projetoId ?? '', metaById[c.id]?.thumbnail_path) ?? undefined,
                dot: DOT[metadadoStatus(metaById[c.id], statusMap.get(c.id))],
                ativo: c.id === activeId,
                onClick: () => selectCut(c.id),
              })),
            }
          : undefined,
      atual: corteAtivo
        ? {
            num: String(corteAtivo.numero),
            titulo: corteAtivo.titulo_proposto,
            onAnterior: () => irParaCorte(-1),
            onProximo: () => irParaCorte(1),
            onVerTodos: () => navigate(`/projetos/${projetoId}`),
          }
        : undefined,
      barra:
        cuts.length > 0
          ? {
              extra: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span className="lbl">Pronto p/ YouTube</span>
                  <b style={{ fontSize: 12.5 }}>
                    {stats.ready} de {stats.total}
                  </b>
                  <span
                    style={{ width: 140, height: 4, borderRadius: 2, background: 'var(--inset)' }}
                    aria-hidden
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        borderRadius: 2,
                        background: 'var(--accent)',
                        width: `${stats.total > 0 ? Math.round((stats.ready / stats.total) * 100) : 0}%`,
                      }}
                    />
                  </span>
                </span>
              ),
              primario: {
                texto:
                  cortesProntos.length === 0
                    ? 'Nada pronto para publicar'
                    : `Publicar ${cortesProntos.length} ${cortesProntos.length === 1 ? 'corte' : 'cortes'}`,
                icone: 'send',
                onClick: () => setPublicarOpen(true),
                desabilitado: cortesProntos.length === 0,
              },
            }
          : undefined,
    },
    [
      cuts,
      activeId,
      stats,
      metaById,
      statusMap,
      cortesProntos.length,
      projetoQuery.data?.titulo_live,
    ],
  );

  if (!projetoId) {
    return <div className="p-6 text-sm text-error">Projeto nao encontrado.</div>;
  }

  return (
    <div
      className={cn(
        'flex min-h-0 text-[var(--wb-text)]',
        CASCA_NOVA ? '' : 'overflow-hidden bg-[var(--wb-bg)]',
        CASCA_NOVA ? '' : workbench ? 'h-full' : 'h-screen',
      )}
    >
      {/* Workbench: lista esquerda de cortes aprovados com status por item. */}
      {!CASCA_NOVA && workbench && cuts.length > 0 && (
        <MetadataCutBar
          cuts={cuts}
          activeId={activeId}
          statusMap={statusMap}
          metaById={metaById}
          onSelect={selectCut}
          vertical
        />
      )}

      <main
        className={cn('flex min-w-0 flex-1 flex-col', CASCA_NOVA ? '' : 'overflow-hidden')}
      >
        {CASCA_NOVA ? null : workbench ? (
          <header className="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-4 py-2.5">
            <h1 className="text-[15px] font-extrabold">Metadados & Thumbnails</h1>
            <span className="text-xs text-[var(--wb-text-mute)]">
              títulos, descrições, capas e publicação
            </span>
          </header>
        ) : (
          <header className="bg-[var(--wb-bg)] px-7 py-6">
            <div className="min-w-0">
              <Link
                to={`/projetos/${projetoId}`}
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
              >
                <ArrowLeft size={14} aria-hidden />
                Projeto
              </Link>
              <h1 className="font-editorial text-[56px] font-normal leading-[0.92] tracking-[-0.01em] text-[var(--wb-text)]">
                Metadados & Thumbnails
              </h1>
              <p className="mt-3 text-lg text-[var(--wb-text-mute)]">
                Metadados prontos para publicacao no YouTube.
              </p>
            </div>
          </header>
        )}

        {!CASCA_NOVA && !workbench && cuts.length > 0 && (
          <MetadataCutBar
            cuts={cuts}
            activeId={activeId}
            statusMap={statusMap}
            metaById={metaById}
            onSelect={selectCut}
          />
        )}

        <div className={CASCA_NOVA ? '' : 'flex-1 overflow-auto bg-[var(--wb-bg)] p-4'}>
          {cortesQuery.isLoading ? (
            <div className="grid min-h-[300px] place-items-center">
              <Loader2 className="animate-spin text-[var(--wb-text-dim)]" />
            </div>
          ) : cortesQuery.isError ? (
            <div className="grid min-h-[300px] place-items-center rounded-[var(--radius-lg)] border border-error/30 bg-error/5 p-8 text-center">
              <div>
                <p className="font-editorial text-2xl font-medium text-error">
                  Erro ao carregar cortes
                </p>
                <p className="mt-1 text-sm text-[var(--wb-text-mute)]">
                  {cortesQuery.error instanceof Error
                    ? cortesQuery.error.message
                    : 'Tente novamente.'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => void cortesQuery.refetch()}
                >
                  <RefreshCw />
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : cuts.length === 0 ? (
            <div className="grid min-h-[320px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
              <div>
                <Check size={34} className="mx-auto mb-3 text-[var(--wb-text-dim)]" aria-hidden />
                <p className="font-editorial text-3xl font-medium">Nenhum corte aprovado</p>
                <p className="mt-1 text-sm text-[var(--wb-text-mute)]">
                  Aprove cortes no editor antes de gerar metadados.
                </p>
                <Button asChild className="mt-5">
                  <Link to={`/projetos/${projetoId}/cortes`}>Ir para editor</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {cuts.map((cut) => (
                <MetadataCard
                  key={cut.id}
                  projetoId={projetoId}
                  cut={cut}
                  status={statusMap.get(cut.id)}
                  active={cut.id === activeId}
                  innerRef={(element) => {
                    refs.current[cut.id] = element;
                  }}
                  onMetaLoaded={handleMetaLoaded}
                />
              ))}
            </div>
          )}
        </div>

        {/* Rodapé Workbench: PRONTO P/ YOUTUBE X de Y + publicar em massa. */}
        {!CASCA_NOVA && workbench && cuts.length > 0 && (
          <footer className="flex flex-none items-center gap-3 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-4 py-2.5">
            <span className="whitespace-nowrap font-code text-[9px] font-extrabold tracking-[0.14em] text-[var(--wb-text-dim)]">
              PRONTO P/ YOUTUBE
            </span>
            <span className="text-xs font-bold">
              {stats.ready} de {stats.total}
            </span>
            <div className="h-1.5 min-w-[120px] flex-1 rounded-full bg-[var(--wb-bg-inset)]">
              <div
                className="h-full rounded-full bg-[var(--wb-ok)] transition-[width] duration-300"
                style={{
                  width: `${stats.total > 0 ? Math.round((stats.ready / stats.total) * 100) : 0}%`,
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={() => setPublicarOpen(true)}
              disabled={cortesProntos.length === 0}
            >
              <Rocket />
              Publicar em massa
            </Button>
          </footer>
        )}
      </main>
      {CASCA_NOVA ? null : <MetadataRightRail stats={stats} />}

      <PublicarMassaModal
        open={publicarOpen}
        onClose={() => setPublicarOpen(false)}
        projetoId={projetoId}
        cortesProntos={cortesProntos}
      />
    </div>
  );
}

function MetadataCutBar({
  cuts,
  activeId,
  statusMap,
  metaById,
  onSelect,
  vertical = false,
}: {
  cuts: Corte[];
  activeId: string;
  statusMap: Map<string, StatusExportCorte>;
  metaById: Record<string, MetadadoCorte>;
  onSelect: (corteId: string) => void;
  /** Workbench (DE-PARA §6): lista vertical à esquerda em vez de barra no topo. */
  vertical?: boolean;
}) {
  return (
    <nav
      aria-label="Cortes aprovados"
      className={cn(
        'bg-[var(--wb-bg-panel)]',
        vertical
          ? 'flex w-[236px] flex-none flex-col gap-1.5 overflow-y-auto border-r border-[var(--wb-border-soft)] p-2.5'
          : 'flex gap-2 overflow-x-auto border-y border-[var(--wb-border-soft)] px-4 py-2.5',
      )}
    >
      {cuts.map((cut) => {
        const active = cut.id === activeId;
        const status = metadadoStatus(metaById[cut.id], statusMap.get(cut.id));
        return (
          <button
            type="button"
            key={cut.id}
            onClick={() => onSelect(cut.id)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-xs font-bold transition-colors',
              vertical && 'h-auto w-full py-1.5 text-left',
              active
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text)] hover:border-[var(--wb-text-dim)]',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 flex-none rounded-full',
                status === 'ready' && 'bg-success',
                status === 'partial' && 'bg-warning',
                status === 'empty' && 'bg-[var(--wb-text-dim)]',
              )}
            />
            <span className="font-code text-[var(--wb-text-dim)]">#{cut.numero}</span>
            <span className={cn('truncate', vertical ? 'min-w-0 flex-1' : 'max-w-[190px]')}>
              {cut.titulo_proposto}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function MetadataRightRail({
  stats,
}: {
  stats: { total: number; ready: number; prompts: number; thumbs: number };
}) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col gap-2.5 border-l border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3.5 xl:flex">
      <div className="px-0.5 pb-2 pt-1">
        <div className="font-code text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--wb-text-dim)]">
          producao
        </div>
        <h2 className="mt-2 font-editorial text-[30px] font-medium leading-[0.95]">
          Status dos cortes
        </h2>
      </div>
      <Metric
        icon={<Tag size={14} />}
        label="Metadados"
        value={`${stats.ready}/${stats.total}`}
        tone="var(--wb-accent)"
      />
      <Metric
        icon={<Sparkles size={14} />}
        label="Prompts"
        value={`${stats.prompts}/${stats.total}`}
        tone="oklch(0.62 0.18 38)"
      />
      <Metric
        icon={<Image size={14} />}
        label="Thumbs"
        value={`${stats.thumbs}/${stats.total}`}
        tone="var(--success)"
      />
      <div className="mt-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-3 text-xs leading-relaxed text-[var(--wb-text-mute)]">
        A lista central mantem titulo, texto de capa, prompt e thumbnail de cada corte em um unico
        lugar.
      </div>
    </aside>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3">
      <div className="flex items-center gap-2 text-[var(--wb-text-mute)]" style={{ color: tone }}>
        {icon}
        <span className="font-code text-[11px] font-bold uppercase tracking-[0.08em]">{label}</span>
      </div>
      <strong className="font-editorial text-[30px] font-medium text-[var(--wb-text)]">
        {value}
      </strong>
    </div>
  );
}
