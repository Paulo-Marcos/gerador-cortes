import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Rocket } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { useCortesProjeto, usePipelineStatus } from '@/hooks/useEditor';
import { exportStatusKey, projetoKey, useExportStatus } from '@/hooks/useProjetoDetalhe';
import { api } from '@/lib/api';
import type { FiltroExport } from '@/types/models';
import {
  PPCutsRail,
  PPSidePanel,
  PPTopBar,
  PPVideoPanel,
  progressFromPipelineArtifacts,
} from './postProductionPage/components';

const FALLBACK_FILTERS: FiltroExport[] = [
  {
    id: 'cinematic_iii',
    nome: 'Cinematico III',
    descricao: 'Referencia (curves+vinheta)',
    tem_filtro_visual: true,
  },
  {
    id: 'bypass_dourado_aberto',
    nome: 'Bypass Cinematico Dourado',
    descricao: 'Padrao leve',
    tem_filtro_visual: true,
  },
];

const DEFAULT_FILTER = 'bypass_dourado_aberto';

const VARIANTES_CINE_III = ['cinematic_iii', 'bypass_dourado_aberto'];

export function PostProductionPage() {
  const { id: projetoId } = useParams();
  const [searchParams] = useSearchParams();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(() => searchParams.get('corte') ?? '');
  const [selectedFilter, setSelectedFilter] = useState(DEFAULT_FILTER);
  const [previewSeconds, setPreviewSeconds] = useState(15);
  const [bulkVideosPerDay, setBulkVideosPerDay] = useState(3);
  const [bulkSchedule, setBulkSchedule] = useState(true);
  const [bulkStartAt, setBulkStartAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Record<string, string>>({});
  const [renderFinalLocal, setRenderFinalLocal] = useState(
    () =>
      Boolean(searchParams.get('corte')) &&
      window.localStorage.getItem(`render-final:${searchParams.get('corte')}`) === 'running',
  );

  const cortesQuery = useCortesProjeto(projetoId);
  const exportQuery = useExportStatus(projetoId);
  const filtrosQuery = useQuery({
    queryKey: ['export-filtros'],
    queryFn: () => api.listarFiltros(),
  });
  const settingsQuery = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.obterSettings,
  });
  const filaQuery = useQuery({
    queryKey: ['fila-processamento', projetoId],
    queryFn: () => api.filaProcessamento(projetoId!),
    enabled: Boolean(projetoId),
    refetchInterval: 4_000,
  });

  const statuses = useMemo(
    () => (exportQuery.data?.cortes ?? []).slice().sort((a, b) => a.numero - b.numero),
    [exportQuery.data],
  );
  const cutsById = useMemo(
    () => new Map((cortesQuery.data ?? []).map((cut) => [cut.id, cut] as const)),
    [cortesQuery.data],
  );
  const activeStatus = statuses.find((status) => status.corte_id === activeId) ?? statuses[0];
  const activeCut = activeStatus ? cutsById.get(activeStatus.corte_id) : undefined;
  const pipelineStatus = usePipelineStatus(activeStatus?.corte_id, renderFinalLocal);
  const filtros = filtrosQuery.data?.filtros?.length ? filtrosQuery.data.filtros : FALLBACK_FILTERS;
  const filtroGlobalPadrao = settingsQuery.data?.filtro_global_padrao ?? DEFAULT_FILTER;
  const readyToPublish = statuses.filter(
    (status) => status.pronto_publicar && !status.youtube_video_id,
  );
  const pendingPost = statuses.filter((status) => status.raw_pronto && !status.video_pronto);
  const selectedFilterIsAvailable = filtros.some((filtro) => filtro.id === selectedFilter);

  const versionsQuery = useQuery({
    queryKey: ['export-versoes', activeStatus?.corte_id],
    queryFn: () => api.listarVersoes(activeStatus!.corte_id),
    enabled: Boolean(activeStatus?.raw_pronto),
  });

  const invalidateAll = useCallback(() => {
    if (!projetoId) return;
    void queryClient.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
    void queryClient.invalidateQueries({ queryKey: projetoKey(projetoId) });
    if (activeStatus)
      void queryClient.invalidateQueries({ queryKey: ['export-versoes', activeStatus.corte_id] });
    void queryClient.invalidateQueries({ queryKey: ['fila-processamento', projetoId] });
  }, [activeStatus, projetoId, queryClient]);

  useEffect(() => {
    if (!activeId && statuses[0]) setActiveId(statuses[0].corte_id);
  }, [activeId, statuses]);

  useEffect(() => {
    const requested = searchParams.get('corte');
    if (!requested || requested === activeId) return;
    if (statuses.some((status) => status.corte_id === requested)) setActiveId(requested);
  }, [activeId, searchParams, statuses]);

  useEffect(() => {
    // I-023: fonte única do filtro de render = AppSettings.filtro_global_padrao.
    // Aqui usamos só como sugestão inicial de seleção na UI desta página.
    if (!selectedFilterIsAvailable) setSelectedFilter(filtroGlobalPadrao);
  }, [filtroGlobalPadrao, filtros, selectedFilterIsAvailable]);

  useEffect(() => {
    const corteId = activeStatus?.corte_id;
    setRenderFinalLocal(
      Boolean(corteId) && window.localStorage.getItem(`render-final:${corteId}`) === 'running',
    );
  }, [activeStatus?.corte_id]);

  useEffect(() => {
    const corteId = activeStatus?.corte_id;
    if (!corteId || !renderFinalLocal) return;
    const status = pipelineStatus.data;
    if (!status) return;

    const finished =
      status?.state === 'done' || status?.fases?.encode || activeStatus?.video_pronto;
    const failed = status?.state === 'error';
    const backendIdle = status?.running === false && status?.state !== 'running';
    if (!finished && !failed && !backendIdle) return;

    window.localStorage.removeItem(`render-final:${corteId}`);
    setRenderFinalLocal(false);
    invalidateAll();
  }, [
    activeStatus?.corte_id,
    activeStatus?.video_pronto,
    invalidateAll,
    pipelineStatus.data,
    renderFinalLocal,
  ]);

  const statusMutation = useMutation({
    mutationFn: async (kind: 'approved' | 'rejected' | 'fire' | 'book') => {
      if (!activeStatus) throw new Error('Selecione um corte.');
      if (kind === 'approved') return api.aprovarCorte(activeStatus.corte_id);
      if (kind === 'rejected') {
        if (
          !window.confirm(
            'Tem certeza que deseja excluir permanentemente este corte e todos os seus arquivos?',
          )
        ) {
          return Promise.reject(new Error('Cancelado'));
        }
        return api.deletarCorte(activeStatus.corte_id);
      }
      if (kind === 'fire') return api.toggleFireMeta(activeStatus.corte_id);
      if (!activeCut) throw new Error('Corte nao carregado.');
      return api.atualizarCorte(activeStatus.corte_id, { is_leitura: !activeCut.is_leitura });
    },
    onSuccess: () => {
      invalidateAll();
      notify('Status atualizado.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao atualizar status.', {
        tone: 'error',
      }),
  });

  const gerarBruto = useMutation({
    mutationFn: () => api.cortarClipBruto(activeStatus!.corte_id),
    onSuccess: () => {
      notify('Recorte bruto enfileirado.', { tone: 'success' });
      window.setTimeout(invalidateAll, 5_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar bruto.', { tone: 'error' }),
  });

  const processarClip = useMutation({
    mutationFn: (filtro: string) => api.processarClip(activeStatus!.corte_id, filtro),
    onSuccess: () => {
      notify('Pos-producao iniciada.', { tone: 'success' });
      window.setTimeout(invalidateAll, 5_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao processar clip.', { tone: 'error' }),
  });

  const previewFiltro = useMutation({
    mutationFn: (filtro: string) =>
      api.processarMultiversion(activeStatus!.corte_id, true, previewSeconds, [filtro]),
    onSuccess: () => {
      notify(`Preview de filtro (${previewSeconds}s) enfileirada.`, { tone: 'success' });
      window.setTimeout(invalidateAll, 8_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar preview.', { tone: 'error' }),
  });

  const previewTodos = useMutation({
    mutationFn: () => api.processarMultiversion(activeStatus!.corte_id, true, previewSeconds, null),
    onSuccess: () => {
      notify(`Previews de todos os filtros (${previewSeconds}s) enfileiradas.`, {
        tone: 'success',
      });
      window.setTimeout(invalidateAll, 8_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar previews.', { tone: 'error' }),
  });

  const previewCineIII = useMutation({
    mutationFn: () =>
      api.processarMultiversion(activeStatus!.corte_id, true, previewSeconds, VARIANTES_CINE_III),
    onSuccess: () => {
      notify(
        `Comparativo final com ${VARIANTES_CINE_III.length} filtros (${previewSeconds}s) enfileirado.`,
        { tone: 'success' },
      );
      window.setTimeout(invalidateAll, 8_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar comparativo final.', {
        tone: 'error',
      }),
  });

  const faststart = useMutation({
    mutationFn: () => api.aplicarFaststart(activeStatus!.corte_id),
    onSuccess: (res) => notify(res.mensagem || 'Video otimizado.', { tone: 'success' }),
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao otimizar video.', { tone: 'error' }),
  });

  const abrirPasta = useMutation({
    mutationFn: () => api.abrirPastaCorte(activeStatus!.corte_id),
    onSuccess: () => notify('Pasta aberta pelo backend.', { tone: 'success' }),
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao abrir pasta.', { tone: 'error' }),
  });

  // I-023: filtro padrão de render vive SÓ em Ajustes (AppSettings.filtro_global_padrao).
  // O endpoint `atualizarFiltroPadrao` (por projeto) foi removido. O selector
  // de filtro abaixo serve apenas para escolher qual preset usar nas operações
  // desta página (preview, bulk processar) — sem persistir nada.

  const bulkProcessar = useMutation({
    mutationFn: () =>
      api.bulkProcessar(
        projetoId!,
        pendingPost.map((status) => status.corte_id),
        selectedFilter,
      ),
    onSuccess: () => {
      notify('Processamento em massa iniciado.', { tone: 'success' });
      window.setTimeout(invalidateAll, 4_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao iniciar processamento em massa.', {
        tone: 'error',
      }),
  });

  const uploadYoutube = useMutation({
    mutationFn: (corteId: string) => {
      const date = scheduledAt[corteId];
      return api.uploadYouTube(corteId, {
        scheduled_at: date ? new Date(date).toISOString() : null,
      });
    },
    onSuccess: () => {
      notify('Upload enviado para o YouTube.', { tone: 'success' });
      window.setTimeout(invalidateAll, 3_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro no upload.', { tone: 'error' }),
  });

  const bulkYoutube = useMutation({
    mutationFn: () =>
      api.bulkYoutube(projetoId!, {
        corte_ids: readyToPublish.map((status) => status.corte_id),
        agendar: bulkSchedule,
        videos_por_dia: bulkVideosPerDay,
        data_inicio: bulkStartAt ? new Date(bulkStartAt).toISOString() : undefined,
        hora_publicacao: '00:00',
      }),
    onSuccess: (res) => {
      notify(res.message, { tone: 'success' });
      window.setTimeout(invalidateAll, 3_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao publicar em massa.', {
        tone: 'error',
      }),
  });

  function processarRenderFinal() {
    if (!activeStatus || renderFinalLocal || pipelineStatus.data?.running) return;
    window.localStorage.setItem(`render-final:${activeStatus.corte_id}`, 'running');
    setRenderFinalLocal(true);
    processarClip.mutate(selectedFilter, {
      onSuccess: () => {
        void pipelineStatus.refetch();
        window.setTimeout(invalidateAll, 5_000);
      },
      onError: () => {
        window.localStorage.removeItem(`render-final:${activeStatus.corte_id}`);
        setRenderFinalLocal(false);
      },
    });
  }

  const renderFinalRunning = Boolean(
    renderFinalLocal || pipelineStatus.data?.running || processarClip.isPending,
  );
  const renderFinalProgress = Math.round(
    pipelineStatus.data?.progress ??
      (renderFinalRunning ? progressFromPipelineArtifacts(pipelineStatus.data?.fases) : 0),
  );

  if (!projetoId) return <div className="p-6 text-sm text-error">Projeto nao encontrado.</div>;

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <PPCutsRail
        statuses={statuses}
        cutsById={cutsById}
        activeId={activeStatus?.corte_id ?? ''}
        onSelect={setActiveId}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeStatus ? (
          <>
            <PPTopBar
              projetoId={projetoId}
              status={activeStatus}
              cut={activeCut}
              onToggle={(kind) => statusMutation.mutate(kind)}
              onGerarBruto={() => gerarBruto.mutate()}
              onProcessar={processarRenderFinal}
              onRefresh={invalidateAll}
              onOpenFolder={() => abrirPasta.mutate()}
              working={statusMutation.isPending || gerarBruto.isPending}
              renderWorking={renderFinalRunning}
              renderProgress={renderFinalProgress}
              renderStage={pipelineStatus.data?.stage}
            />
            <div className="grid min-h-0 flex-1 gap-3 p-4 xl:grid-cols-[1.55fr_1fr]">
              <PPVideoPanel projetoId={projetoId} status={activeStatus} cut={activeCut} />
              <PPSidePanel
                projetoId={projetoId}
                status={activeStatus}
                cut={activeCut}
                filtros={filtros}
                selectedFilter={selectedFilter}
                setSelectedFilter={setSelectedFilter}
                previewSeconds={previewSeconds}
                setPreviewSeconds={setPreviewSeconds}
                onPreview={() => previewFiltro.mutate(selectedFilter)}
                onPreviewAll={() => previewTodos.mutate()}
                onPreviewCineIII={() => previewCineIII.mutate()}
                onProcess={processarRenderFinal}
                onFaststart={() => faststart.mutate()}
                onBulkProcess={() => bulkProcessar.mutate()}
                onUploadYoutube={() => uploadYoutube.mutate(activeStatus.corte_id)}
                onBulkYoutube={() => bulkYoutube.mutate()}
                pendingPostCount={pendingPost.length}
                readyToPublishCount={readyToPublish.length}
                fila={filaQuery.data}
                versions={versionsQuery.data?.versoes ?? []}
                versionsLoading={versionsQuery.isFetching}
                busy={
                  renderFinalRunning ||
                  previewFiltro.isPending ||
                  previewTodos.isPending ||
                  previewCineIII.isPending ||
                  faststart.isPending ||
                  bulkProcessar.isPending ||
                  uploadYoutube.isPending ||
                  bulkYoutube.isPending
                }
                scheduledAt={scheduledAt[activeStatus.corte_id] ?? ''}
                setScheduledAt={(value) =>
                  setScheduledAt((current) => ({ ...current, [activeStatus.corte_id]: value }))
                }
                bulkVideosPerDay={bulkVideosPerDay}
                setBulkVideosPerDay={setBulkVideosPerDay}
                bulkSchedule={bulkSchedule}
                setBulkSchedule={setBulkSchedule}
                bulkStartAt={bulkStartAt}
                setBulkStartAt={setBulkStartAt}
              />
            </div>
          </>
        ) : (
          <div className="grid min-h-screen place-items-center p-8">
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
              {exportQuery.isLoading ? (
                <Loader2 className="mx-auto animate-spin text-[var(--wb-text-dim)]" />
              ) : exportQuery.isError ? (
                <>
                  <p className="font-editorial text-2xl font-medium text-error">
                    Erro ao carregar status de export
                  </p>
                  <p className="mt-1 text-sm text-[var(--wb-text-mute)]">
                    {exportQuery.error instanceof Error
                      ? exportQuery.error.message
                      : 'Tente novamente.'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => void exportQuery.refetch()}
                  >
                    <RefreshCw />
                    Tentar novamente
                  </Button>
                </>
              ) : (
                <>
                  <Rocket
                    size={34}
                    className="mx-auto mb-3 text-[var(--wb-text-dim)]"
                    aria-hidden
                  />
                  <p className="font-editorial text-3xl font-medium">Nenhum corte aprovado ainda</p>
                  <Button asChild className="mt-5">
                    <Link to={`/projetos/${projetoId}/cortes`}>Ir para editor</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
