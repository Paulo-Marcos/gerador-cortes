import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Image, Loader2, RefreshCw, Sparkles, Tag } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCortesProjeto } from '@/hooks/useEditor';
import { useExportStatus } from '@/hooks/useProjetoDetalhe';
import { cn } from '@/lib/utils';
import type { Corte, MetadadoCorte, StatusExportCorte } from '@/types/models';
import { MetadataCard } from './MetadataCard';

function metadadoStatus(meta?: MetadadoCorte, status?: StatusExportCorte) {
  if (status?.metadados_completos || meta?.titulo_youtube) return 'ready';
  if (meta?.prompt_thumbnail || meta?.texto_capa) return 'partial';
  return 'empty';
}

export function MetadataPage() {
  const { id: projetoId } = useParams();
  const [activeId, setActiveId] = useState('');
  const [metaById, setMetaById] = useState<Record<string, MetadadoCorte>>({});
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const cortesQuery = useCortesProjeto(projetoId);
  const exportQuery = useExportStatus(projetoId);

  const cuts = useMemo(
    () =>
      (cortesQuery.data ?? [])
        .filter(
          (cut) =>
            cut.status === 'aprovado' || cut.status === 'processado' || cut.status === 'editado',
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

  if (!projetoId) {
    return <div className="p-6 text-sm text-error">Projeto nao encontrado.</div>;
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
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

        {cuts.length > 0 && (
          <MetadataCutBar
            cuts={cuts}
            activeId={activeId}
            statusMap={statusMap}
            metaById={metaById}
            onSelect={selectCut}
          />
        )}

        <div className="flex-1 overflow-auto bg-[var(--wb-bg)] p-4">
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
                  innerRef={(element) => {
                    refs.current[cut.id] = element;
                  }}
                  onMetaLoaded={handleMetaLoaded}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <MetadataRightRail stats={stats} />
    </div>
  );
}

function MetadataCutBar({
  cuts,
  activeId,
  statusMap,
  metaById,
  onSelect,
}: {
  cuts: Corte[];
  activeId: string;
  statusMap: Map<string, StatusExportCorte>;
  metaById: Record<string, MetadadoCorte>;
  onSelect: (corteId: string) => void;
}) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-y border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-4 py-2.5">
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
              active
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text)] hover:border-[var(--wb-text-dim)]',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status === 'ready' && 'bg-success',
                status === 'partial' && 'bg-warning',
                status === 'empty' && 'bg-[var(--wb-text-dim)]',
              )}
            />
            <span className="font-code text-[var(--wb-text-dim)]">#{cut.numero}</span>
            <span className="max-w-[190px] truncate">{cut.titulo_proposto}</span>
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
