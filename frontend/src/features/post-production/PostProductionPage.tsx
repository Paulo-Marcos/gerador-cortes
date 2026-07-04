import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  ExternalLink,
  FileText,
  Film,
  Flame,
  Folder,
  GripVertical,
  Image,
  Keyboard,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Scissors,
  SlidersHorizontal,
  UploadCloud,
  VolumeX,
  X,
  Youtube,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { useToast } from '@/components/ui/toaster';
import { useCortesProjeto, usePipelineStatus } from '@/hooks/useEditor';
import { exportStatusKey, projetoKey, useExportStatus } from '@/hooks/useProjetoDetalhe';
import {
  api,
  finalVideoUrl,
  gradedVideoUrl,
  rawVideoRedirectUrl,
  resolveThumbUrl,
  versaoVideoUrl,
} from '@/lib/api';
import { cn, formatarDuracao } from '@/lib/utils';
import type { Corte, FiltroExport, StatusExportCorte } from '@/types/models';

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

function PPCutsRail({
  statuses,
  cutsById,
  activeId,
  onSelect,
}: {
  statuses: StatusExportCorte[];
  cutsById: Map<string, Corte>;
  activeId: string;
  onSelect: (corteId: string) => void;
}) {
  return (
    <nav className="flex h-screen w-24 shrink-0 flex-col gap-1.5 overflow-auto border-r border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 py-3.5">
      <div className="px-1 pb-2 pt-1 text-center font-code text-[9.5px] uppercase tracking-[0.18em] text-[var(--wb-text-dim)]">
        cortes - {statuses.length}
      </div>
      {statuses.map((status) => {
        const active = status.corte_id === activeId;
        const cut = cutsById.get(status.corte_id);
        return (
          <button
            type="button"
            key={status.corte_id}
            onClick={() => onSelect(status.corte_id)}
            className={cn(
              'relative flex flex-col items-center gap-1.5 rounded-[var(--radius)] border px-2 py-2.5 transition-colors',
              active
                ? 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text)]'
                : 'border-transparent text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)]',
            )}
          >
            {active && (
              <span className="absolute bottom-3 left-[-11px] top-3 w-[2px] rounded-full bg-[var(--wb-accent)]" />
            )}
            <span className="font-code text-[13px] font-semibold tabular-nums">
              #{status.numero}
            </span>
            <span className="flex flex-wrap items-center justify-center gap-0.5 text-[11px]">
              {cut?.status === 'rejeitado' && (
                <X size={11} className="text-error" aria-label="rejeitado" />
              )}
              {(cut?.status === 'aprovado' ||
                cut?.status === 'processado' ||
                cut?.status === 'editado') && (
                <Check size={11} className="text-success" aria-label="aprovado" />
              )}
              {cut?.is_fire && <Flame size={11} className="text-warning" aria-label="top" />}
              {cut?.is_leitura && <BookOpen size={11} className="text-info" aria-label="leitura" />}
              {status.raw_pronto && (
                <Film size={10} className="text-[var(--wb-text-mute)]" aria-label="bruto" />
              )}
            </span>
            <span className="font-code text-[9.5px] text-[var(--wb-text-dim)]">
              {cut ? formatarDuracao(Math.max(0, cut.fim_seg - cut.inicio_seg)) : '--:--'}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PPTopBar({
  projetoId,
  status,
  cut,
  onToggle,
  onGerarBruto,
  onProcessar,
  onRefresh,
  onOpenFolder,
  working,
  renderWorking,
  renderProgress,
  renderStage,
}: {
  projetoId: string;
  status: StatusExportCorte;
  cut?: Corte;
  onToggle: (kind: 'approved' | 'rejected' | 'fire' | 'book') => void;
  onGerarBruto: () => void;
  onProcessar: () => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
  working: boolean;
  renderWorking: boolean;
  renderProgress: number;
  renderStage?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-5 py-2.5">
      <Link
        to={`/projetos/${projetoId}`}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-sm text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
      >
        <ArrowLeft size={14} aria-hidden />
        Estudio
      </Link>
      <div className="h-7 w-px bg-[var(--wb-border)]" />
      <div className="min-w-0 flex-[0_1_auto]">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="font-code text-[13px] font-semibold text-[var(--wb-text-dim)]">
            #{status.numero}
          </span>
          <h1 className="max-w-[520px] truncate font-editorial text-[19px] font-medium leading-tight text-[var(--wb-text)]">
            {status.titulo}
          </h1>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusPill
            icon={<Check />}
            label="Aprovado"
            active={cut?.status !== 'rejeitado'}
            color="oklch(0.55 0.13 145)"
            onClick={() => onToggle('approved')}
          />
          <StatusPill
            icon={<X />}
            label="Rejeitado"
            active={cut?.status === 'rejeitado'}
            color="var(--error)"
            onClick={() => onToggle('rejected')}
          />
          <StatusPill
            icon={<Flame />}
            label="TOP"
            active={Boolean(cut?.is_fire)}
            color="oklch(0.62 0.18 38)"
            onClick={() => onToggle('fire')}
          />
          <StatusPill
            icon={<BookOpen />}
            label="Leitura"
            active={Boolean(cut?.is_leitura)}
            color="oklch(0.55 0.13 240)"
            onClick={() => onToggle('book')}
          />
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <ToolButton
          label="Regerar bruto"
          icon={<RefreshCw />}
          primary
          onClick={onGerarBruto}
          disabled={working}
        />
        <ToolButton
          label="Edicao"
          icon={<Scissors />}
          as={Link}
          to={`/projetos/${projetoId}/cortes/${status.corte_id}`}
        />
        <ToolButton
          label={renderWorking ? `Renderizando ${renderProgress}%` : 'Render final'}
          title={renderStage || 'Render final'}
          icon={renderWorking ? <Loader2 className="animate-spin" /> : <Play />}
          success
          onClick={onProcessar}
          disabled={renderWorking || !status.raw_pronto}
          progress={renderWorking ? renderProgress : undefined}
        />
        <div className="mx-1 h-5 w-px bg-[var(--wb-border)]" />
        <ToolButton
          title="Metadados"
          icon={<FileText />}
          as={Link}
          to={`/projetos/${projetoId}/metadados`}
        />
        <ToolButton title="Atualizar pos-producao" icon={<RefreshCw />} onClick={onRefresh} />
        <ToolButton title="Abrir pasta fisica" icon={<Folder />} onClick={onOpenFolder} />
        <ToolButton title="Salvar edicoes" icon={<Save />} onClick={onRefresh} />
        <ToolButton title="Atalhos do teclado" icon={<Keyboard />} onClick={onRefresh} />
      </div>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  active,
  color,
  onClick,
}: {
  icon: React.ReactElement;
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] [&_svg]:size-[11px]"
      style={{
        borderColor: active ? color : 'var(--wb-border)',
        background: active ? color : 'transparent',
        color: active ? '#fff' : 'var(--wb-text-mute)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolButton({
  icon,
  label,
  title,
  primary,
  success,
  disabled,
  onClick,
  as: Comp = 'button',
  to,
  progress,
}: {
  icon: React.ReactNode;
  label?: string;
  title?: string;
  primary?: boolean;
  success?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  as?: typeof Link | 'button';
  to?: string;
  progress?: number;
}) {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  const content = (
    <>
      {boundedProgress > 0 && (
        <span
          className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-500"
          style={{ width: `${boundedProgress}%` }}
          aria-hidden
        />
      )}
      {icon}
      {label && <span className="relative">{label}</span>}
    </>
  );
  const className = cn(
    'relative inline-flex items-center justify-center gap-1.5 overflow-hidden rounded-[var(--radius-sm)] text-xs font-semibold transition-colors [&_svg]:relative [&_svg]:size-3.5',
    label ? 'h-9 px-3' : 'h-[34px] w-[34px]',
    primary
      ? 'border border-transparent bg-[var(--wb-ink)] text-[var(--wb-ink-fg)]'
      : success
        ? 'border border-transparent bg-success text-white'
        : 'border border-[var(--wb-border)] bg-transparent text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
    disabled && 'pointer-events-none opacity-50',
  );
  if (Comp === Link && to) {
    return (
      <Link to={to} title={title ?? label} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      title={title ?? label}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
}

function PPVideoPanel({
  projetoId,
  status,
  cut,
}: {
  projetoId: string;
  status: StatusExportCorte;
  cut?: Corte;
}) {
  const showGraded = !status.video_pronto && status.grade_pronta;
  const showRaw = !status.video_pronto && !status.grade_pronta && status.raw_pronto;
  const src = status.video_pronto
    ? finalVideoUrl(projetoId, status.corte_id)
    : showGraded
      ? gradedVideoUrl(projetoId, status.corte_id)
      : showRaw
        ? rawVideoRedirectUrl(status.corte_id)
        : '';
  const label = status.video_pronto
    ? 'video final'
    : showGraded
      ? 'graded'
      : showRaw
        ? 'bruto'
        : 'pendente';
  const duration = cut ? formatarDuracao(Math.max(0, cut.fim_seg - cut.inicio_seg)) : '--:--';

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <div className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <GripVertical size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
        <span className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          {label}
        </span>
        <span className="rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1.5 py-0.5 font-code text-[10.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          mp4
        </span>
        <div className="flex-1" />
        <span className="font-code text-[11px] text-[var(--wb-text-dim)]">
          {status.video_pronto
            ? 'upload_ready'
            : showGraded
              ? 'clip_graded'
              : showRaw
                ? 'clip_raw'
                : 'aguardando'}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        {src ? (
          <video src={src} controls preload="metadata" className="h-full w-full bg-black" />
        ) : (
          <ThumbnailPlaceholder hue={(status.numero * 47) % 360} className="h-full w-full" />
        )}
        {!src && (
          <div className="absolute inset-0 grid place-items-center bg-black/15 text-center text-white">
            <div>
              <Film size={42} className="mx-auto mb-2 opacity-80" aria-hidden />
              <div className="font-editorial text-2xl font-medium">
                Gere o recorte bruto primeiro
              </div>
            </div>
          </div>
        )}
        {src && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-[var(--radius-xs)] bg-black/60 px-3 py-2 text-white backdrop-blur-sm">
            <div className="font-code text-[10.5px] uppercase tracking-[0.1em] opacity-75">
              {status.video_pronto ? 'render final' : showGraded ? 'graded' : 'recorte bruto'}
            </div>
            <div className="mt-1 font-editorial text-[22px] font-medium">
              {status.video_pronto
                ? 'Pronto para revisao rapida'
                : showGraded
                  ? 'Graded pronto para overlays'
                  : 'Base pronta para tratamento'}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--wb-border-soft)] px-3 py-2">
        <button type="button" className="text-[var(--wb-text)]">
          <Play size={14} fill="currentColor" aria-hidden />
        </button>
        <span className="font-code text-[11px] text-[var(--wb-text-mute)]">00:00</span>
        <div className="h-1 flex-1 rounded-full bg-[var(--wb-bg-inset)]">
          <div
            className={cn(
              'h-full rounded-full',
              status.video_pronto ? 'w-full bg-success' : 'w-1/3 bg-[var(--wb-accent)]',
            )}
          />
        </div>
        <span className="font-code text-[11px] text-[var(--wb-text-mute)]">{duration}</span>
        <button type="button" className="text-[var(--wb-text-mute)]">
          <VolumeX size={14} aria-hidden />
        </button>
      </div>
    </section>
  );
}

function progressFromPipelineArtifacts(fases?: {
  raw: boolean;
  grade: boolean;
  overlays: boolean;
  compose: boolean;
  encode: boolean;
}): number {
  if (!fases) return 1;
  if (fases.encode) return 100;
  if (fases.compose) return 72;
  if (fases.overlays) return 55;
  if (fases.grade) return 22;
  if (fases.raw) return 8;
  return 1;
}

function PPSidePanel({
  projetoId,
  status,
  cut,
  filtros,
  selectedFilter,
  setSelectedFilter,
  previewSeconds,
  setPreviewSeconds,
  onPreview,
  onPreviewAll,
  onPreviewCineIII,
  onProcess,
  onFaststart,
  onBulkProcess,
  onUploadYoutube,
  onBulkYoutube,
  pendingPostCount,
  readyToPublishCount,
  fila,
  versions,
  versionsLoading,
  busy,
  scheduledAt,
  setScheduledAt,
  bulkVideosPerDay,
  setBulkVideosPerDay,
  bulkSchedule,
  setBulkSchedule,
  bulkStartAt,
  setBulkStartAt,
}: {
  projetoId: string;
  status: StatusExportCorte;
  cut?: Corte;
  filtros: FiltroExport[];
  selectedFilter: string;
  setSelectedFilter: (filter: string) => void;
  previewSeconds: number;
  setPreviewSeconds: (value: number) => void;
  onPreview: () => void;
  onPreviewAll: () => void;
  onPreviewCineIII: () => void;
  onProcess: () => void;
  onFaststart: () => void;
  onBulkProcess: () => void;
  onUploadYoutube: () => void;
  onBulkYoutube: () => void;
  pendingPostCount: number;
  readyToPublishCount: number;
  fila?: {
    ativo: boolean;
    total: number;
    concluidos: number;
    processando: number;
    aguardando: number;
    erros: number;
    pct: number;
  };
  versions: Array<{
    filtro: string;
    nome: string;
    descricao?: string;
    e_preview: boolean;
    completo_disponivel: boolean;
    tamanho_mb?: number;
  }>;
  versionsLoading: boolean;
  busy: boolean;
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
  bulkVideosPerDay: number;
  setBulkVideosPerDay: (value: number) => void;
  bulkSchedule: boolean;
  setBulkSchedule: (value: boolean) => void;
  bulkStartAt: string;
  setBulkStartAt: (value: string) => void;
}) {
  const thumbUrl = resolveThumbUrl(projetoId, status.thumbnail_path);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <div className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-[var(--wb-text-mute)]" aria-hidden />
          <strong className="font-editorial text-xl font-medium">Pos-producao</strong>
          <span className="rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 font-code text-[11px] text-[var(--wb-accent)]">
            {status.pronto_publicar ? 'pronto' : 'em preparo'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button type="button" size="sm" onClick={onProcess} disabled={!status.raw_pronto || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            Pos-producao final
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onPreview}
            disabled={!status.raw_pronto || busy}
          >
            <Film />
            Preview {previewSeconds}s
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onPreviewAll}
            disabled={!status.raw_pronto || busy}
          >
            <RefreshCw />
            Todas previews
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onPreviewCineIII}
            disabled={!status.raw_pronto || busy}
          >
            <Film />
            Comparar finais
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-3">
          <span className="font-code text-[11px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Duracao preview
          </span>
          <input
            type="range"
            min={5}
            max={20}
            step={1}
            value={previewSeconds}
            onChange={(event) => setPreviewSeconds(Number(event.target.value) || 15)}
            className="flex-1 accent-[var(--wb-accent)]"
            aria-label="Duracao do preview em segundos"
          />
          <span className="w-12 text-right font-code text-[12px] font-bold tabular-nums text-[var(--wb-text)]">
            {previewSeconds}s
          </span>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid gap-3">
          <Checklist status={status} />

          {fila?.ativo && (
            <div className="rounded-[var(--radius)] border border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] p-3">
              <div className="flex items-center justify-between text-sm font-bold text-[var(--wb-accent)]">
                Processamento em andamento
                <span>{fila.processando} processando</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--wb-bg-panel)]">
                <div className="h-full bg-[var(--wb-accent)]" style={{ width: `${fila.pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 font-code text-[11px] text-[var(--wb-text-mute)]">
                <span>{fila.pct}% concluido</span>
                <span>
                  {fila.concluidos}/{fila.total} completos
                </span>
                <span>{fila.aguardando} aguardando</span>
                {fila.erros > 0 && <span className="text-error">{fila.erros} erro(s)</span>}
              </div>
            </div>
          )}

          <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
              <span className="font-code text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Filtro para esta operação
              </span>
            </div>
            <div className="grid gap-2">
              {filtros.map((filtro) => (
                <button
                  key={filtro.id}
                  type="button"
                  onClick={() => setSelectedFilter(filtro.id)}
                  className={cn(
                    'grid gap-1 rounded-[var(--radius-sm)] border p-2 text-left transition-colors',
                    selectedFilter === filtro.id
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                      : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] hover:border-[var(--wb-text-dim)]',
                  )}
                >
                  <span className="text-sm font-bold">{filtro.nome}</span>
                  <span className="text-xs text-[var(--wb-text-mute)]">{filtro.descricao}</span>
                </button>
              ))}
            </div>
            {pendingPostCount > 0 && (
              <Button type="button" className="mt-3 w-full" onClick={onBulkProcess} disabled={busy}>
                <RefreshCw />
                Aplicar a {pendingPostCount} pendente(s)
              </Button>
            )}
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileText size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
              <span className="font-code text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Metadados e capa
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)]">
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="aspect-video h-full w-full object-cover" />
                ) : (
                  <ThumbnailPlaceholder hue={(status.numero * 41) % 360} />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {status.titulo_youtube || status.titulo}
                </p>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--wb-text-mute)]">
                  {status.descricao_youtube || 'Metadados ainda nao gerados.'}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link to={`/projetos/${projetoId}/metadados`}>
                    <FileText />
                    Abrir metadados
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Youtube size={14} className="text-error" aria-hidden />
              <span className="font-code text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Publicacao
              </span>
            </div>
            {status.youtube_video_id ? (
              <a
                href={status.youtube_url_publicado}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-error"
              >
                <ExternalLink size={14} aria-hidden />
                YouTube {status.youtube_scheduled_at ? '(agendado)' : '(publicado)'}
              </a>
            ) : (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-xs text-[var(--wb-text-dim)]">Agendar em</span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="h-9 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-xs outline-none"
                  />
                </label>
                <Button
                  type="button"
                  onClick={onUploadYoutube}
                  disabled={!status.pronto_publicar || busy}
                >
                  <UploadCloud />
                  {scheduledAt ? 'Agendar' : 'Enviar p/ YouTube'}
                </Button>
              </div>
            )}

            {readyToPublishCount > 0 && (
              <div className="mt-3 border-t border-[var(--wb-border-soft)] pt-3">
                <div className="mb-2 text-sm font-bold">
                  {readyToPublishCount} pronto(s) para publicar
                </div>
                <div className="grid gap-2 sm:grid-cols-[90px_minmax(0,1fr)]">
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--wb-text-dim)]">Vid/dia</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={bulkVideosPerDay}
                      onChange={(event) => setBulkVideosPerDay(Number(event.target.value) || 1)}
                      className="h-9 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-xs outline-none"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[var(--wb-text-dim)]">Data/hora inicial</span>
                    <input
                      type="datetime-local"
                      value={bulkStartAt}
                      onChange={(event) => setBulkStartAt(event.target.value)}
                      className="h-9 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-xs outline-none"
                    />
                  </label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--wb-text-mute)]">
                  <input
                    type="checkbox"
                    checked={bulkSchedule}
                    onChange={(event) => setBulkSchedule(event.target.checked)}
                  />
                  Agendar publicacao
                </label>
                <Button
                  type="button"
                  className="mt-3 w-full bg-error hover:opacity-90"
                  onClick={onBulkYoutube}
                  disabled={busy}
                >
                  <Youtube />
                  Publicar prontos
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Film size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
              <span className="font-code text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Versoes de filtro
              </span>
              <div className="flex-1" />
              {versionsLoading && (
                <Loader2 size={14} className="animate-spin text-[var(--wb-text-dim)]" />
              )}
            </div>
            {versions.length > 0 ? (
              <div className="grid gap-2">
                {versions.map((version) => (
                  <div
                    key={`${version.filtro}-${version.e_preview}`}
                    className="rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{version.nome || version.filtro}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold',
                          version.e_preview
                            ? 'bg-warning/15 text-warning'
                            : 'bg-success/15 text-success',
                        )}
                      >
                        {version.e_preview ? 'PREVIEW' : 'COMPLETO'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--wb-text-dim)]">
                      {version.descricao || `${version.tamanho_mb ?? 0} MB`}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <a
                        href={versaoVideoUrl(
                          projetoId,
                          status.corte_id,
                          version.filtro,
                          version.e_preview,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-border)] text-[11px] font-bold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
                      >
                        <Download size={12} aria-hidden />
                        Abrir
                      </a>
                      {version.e_preview && !version.completo_disponivel && (
                        <Button type="button" size="sm" onClick={onProcess} disabled={busy}>
                          Usar completo
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-[var(--wb-text-mute)]">
                Nenhuma versao gerada ainda. Use Preview 10s ou Todas previews para comparar
                filtros.
              </p>
            )}
          </div>

          {status.video_pronto && (
            <div className="grid gap-2 rounded-[var(--radius)] border border-success bg-success/10 p-3">
              <div className="text-sm font-bold text-success">Video pos-produzido</div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a
                    href={finalVideoUrl(projetoId, status.corte_id)}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Download />
                    Baixar MP4 final
                  </a>
                </Button>
                <Button type="button" variant="outline" onClick={onFaststart} disabled={busy}>
                  <Rocket />
                  Otimizar p/ YT
                </Button>
              </div>
            </div>
          )}

          {cut?.is_leitura && (
            <div className="rounded-[var(--radius)] border border-info/30 bg-info/10 p-3 text-xs text-info">
              <BookOpen size={14} className="mr-1 inline" aria-hidden />
              Corte marcado como leitura
              {cut.autor_leitura ? `: ${cut.autor_leitura} PT.${cut.parte_leitura || 1}` : ''}.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Checklist({ status }: { status: StatusExportCorte }) {
  const rows = [
    { label: 'Recorte bruto', ok: status.raw_pronto, icon: <Film /> },
    { label: 'Pos-producao', ok: status.video_pronto, icon: <Play /> },
    { label: 'Thumbnail', ok: status.thumbnail_pronta, icon: <Image /> },
    { label: 'Metadados', ok: status.metadados_completos, icon: <FileText /> },
    { label: 'YouTube', ok: Boolean(status.youtube_video_id), icon: <Youtube /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            'grid min-h-[58px] place-items-center rounded-[var(--radius-sm)] border p-2 text-center text-[11px] font-bold',
            row.ok
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text-dim)]',
          )}
        >
          <span className="[&_svg]:mx-auto [&_svg]:mb-1 [&_svg]:size-4">
            {row.ok ? <Check /> : row.icon}
          </span>
          {row.label}
        </div>
      ))}
    </div>
  );
}
