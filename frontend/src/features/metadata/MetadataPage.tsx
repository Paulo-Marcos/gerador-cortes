import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCortesProjeto } from '@/features/editor/useCortes';
import { useExportStatus, useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { cn, thumbnailUrl } from '@/lib/utils';
import type { MetadadoCorte, StatusExportCorte } from '@/types/models';
import { PublicarMassaModal } from '@/features/projeto-detalhe/PublicarMassaModal';
import { MetadataCard } from './MetadataCard';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { Icon } from '@/upgrade/Icon';

function metadadoStatus(meta?: MetadadoCorte, status?: StatusExportCorte) {
  if (status?.metadados_completos || meta?.titulo_youtube) return 'ready';
  if (meta?.prompt_thumbnail || meta?.texto_capa) return 'partial';
  return 'empty';
}

/**
 * D-427: a aba de trabalho amarrada a um corte chega aqui com `?corte=` —
 * sem isso a tela abriria sempre no primeiro corte do projeto.
 * D-798: o corte ativo volta para a URL — é de lá que a fita de fases
 * (Cortes, Pós, Revisão) tira o corte para onde levar.
 */
function useCorteAtivoNaUrl(): [string, (corteId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState(() => searchParams.get('corte') ?? '');
  const ativarCorte = useCallback(
    (corteId: string) => {
      setActiveId(corteId);
      setSearchParams({ corte: corteId }, { replace: true });
    },
    [setSearchParams],
  );
  return [activeId, ativarCorte];
}

export function MetadataPage() {
  const { id: projetoId } = useParams();
  const [activeId, ativarCorte] = useCorteAtivoNaUrl();
  const [metaById, setMetaById] = useState<Record<string, MetadadoCorte>>({});
  const [publicarOpen, setPublicarOpen] = useState(false);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const cortesQuery = useCortesProjeto(projetoId);
  const exportQuery = useExportStatus(projetoId);
  const projetoQuery = useProjeto(projetoId);
  const navigate = useNavigate();

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
    if (!activeId && cuts[0]) ativarCorte(cuts[0].id);
  }, [activeId, cuts, ativarCorte]);

  const handleMetaLoaded = useCallback((corteId: string, meta: MetadadoCorte) => {
    setMetaById((current) => ({ ...current, [corteId]: meta }));
  }, []);

  const selectCut = (corteId: string) => {
    ativarCorte(corteId);
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
        '',
        '',
      )}
    >
      {/* Workbench: lista esquerda de cortes aprovados com status por item. */}

      <main
        className={cn('flex min-w-0 flex-1 flex-col', '')}
      >

        <div className="">
          {cortesQuery.isLoading ? (
            <div className="grid min-h-[300px] place-items-center">
              <Icon name="loader-2" size={20} className="animate-spin text-[var(--wb-text-dim)]" />
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
                  <Icon name="refresh-cw" />
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : cuts.length === 0 ? (
            <div className="grid min-h-[320px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
              <div>
                <Icon name="check" ilustracao={34} className="mx-auto mb-3 text-[var(--wb-text-dim)]" />
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
      </main>

      <PublicarMassaModal
        open={publicarOpen}
        onClose={() => setPublicarOpen(false)}
        projetoId={projetoId}
        cortesProntos={cortesProntos}
      />
    </div>
  );
}

