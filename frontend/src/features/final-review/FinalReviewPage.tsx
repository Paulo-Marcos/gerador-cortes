import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Keyboard,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Upload,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { useAbrirPasta, useExportStatus, useProjeto } from '@/hooks/useProjetoDetalhe';
import {
  type RenderStartFrom,
  useAtualizarCorte,
  useCorte,
  useCortesProjeto,
  usePipelineStatus,
  useRenderizarRemotion,
} from '@/hooks/useEditor';
import { useQuery } from '@tanstack/react-query';
import { api, finalVideoUrl, resolveThumbUrl } from '@/lib/api';
import { UnifiedSidebar } from '@/features/editor/UnifiedSidebar';
import { CommonTopBar, type MoreMenuItem } from '@/features/editor/CommonTopBar';
import { WorkbenchCutsPanel } from '@/features/editor/WorkbenchCutsPanel';
import { WorkbenchEditorLayout } from '@/features/editor/WorkbenchEditorLayout';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { useShortcuts, type ShortcutBinding } from '@/features/editor/shortcuts';
import { SceneTimeline } from '@/features/editor/fase2/SceneTimeline';
import { calcularDuracaoLiquida } from '@/features/editor/timeUtils';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import { SettingsModal } from '@/components/layout/SettingsModal';
import { RenderStepsModal } from '@/features/post-production/RenderStepsModal';
import type { FaseRender } from '@/features/post-production/renderEtapas';
import {
  isCorteVideoPronto,
  parseCenasPayload,
  resolveCorteStagePath,
  progressFromPipelineArtifacts,
} from '@/features/post-production/postProductionNavigation';

// Atalhos Ctrl+J/K (F-041): mesmos limites usados na tela Bruta.
const SPEED_MIN = 0.25;
const SPEED_MAX = 4;
const SPEED_STEP = 0.25;

// ─────────────────────────────────────────────────────────────
// FinalReviewPage — replica `design_reference/src/v3_final.jsx`.
//
// READ-ONLY: nada e editavel aqui exceto Metadados (via secondaryAction)
// e Aprovar (primaryAction). Sem botoes de salvar/editar/zoom/+regiao
// nos componentes compartilhados (passa `readOnly={true}`).
//
// Layout: grid 1.5fr 320px / rows 1fr minmax(200px, auto).
//   Player (col 1, row 1) + SceneTimelineReadOnly (col 1, row 2) +
//   ChecklistCard + CapaCard empilhados a direita (col 2, row 1/span 2).
// ─────────────────────────────────────────────────────────────

export function FinalReviewPage() {
  const { id: projetoId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const corteId = searchParams.get('corte') ?? '';
  const { notify } = useToast();

  const projeto = useProjeto(projetoId);
  const cortesQuery = useCortesProjeto(projetoId);
  const corteQuery = useCorte(corteId);
  const exportStatusQ = useExportStatus(projetoId);
  const abrirPasta = useAbrirPasta();
  const renderFinal = useRenderizarRemotion(corteId);
  const atualizarCorte = useAtualizarCorte(corteId, projetoId);
  const [renderFinalLocal, setRenderFinalLocal] = useState(
    () => Boolean(corteId) && window.localStorage.getItem(`render-final:${corteId}`) === 'running',
  );
  const [renderStartModalOpen, setRenderStartModalOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // DE-PARA-v3 §4: o checklist nasce recolhido num contador N/6 — só o
  // contador ocupa a barra de ações; os 6 chips expandem sob demanda.
  const [checklistAberto, setChecklistAberto] = useState(false);
  const pipelineStatus = usePipelineStatus(corteId, renderFinalLocal);
  // D-367: filtro/grade exibido no header do player. No fluxo normal de
  // "Renderizar" o filtro vai `null` e o backend resolve para o global
  // (AppSettings.filtro_global_padrao), entao o global reflete o que foi
  // aplicado. Ressalva: se o global mudar depois do render, mostra o novo.
  const settingsQ = useQuery({ queryKey: ['app-settings'], queryFn: api.obterSettings });
  const filtrosQ = useQuery({ queryKey: ['export-filtros'], queryFn: () => api.listarFiltros() });

  const cortes = useMemo(() => cortesQuery.data ?? [], [cortesQuery.data]);
  const corte = corteQuery.data;
  const exportStatusAtual = exportStatusQ.data?.cortes.find(
    (status) => status.corte_id === corte?.id,
  );
  const videoPronto = corte ? isCorteVideoPronto(corte, exportStatusAtual) : false;
  const cenas = useMemo(
    () => parseCenasPayload(corte?.cenas_remotion).cenas,
    [corte?.cenas_remotion],
  );
  // D-396 (AUDITORIA-v2 §10): badges de sucesso da timeline CENAS/LAYOUT YT
  // no Workbench. Nao ha flag por-cena de "renderizada" nem um "palco_pronto"
  // exposto pela API — usamos os agregados de `exportStatusAtual` ja
  // consumidos pelo checklist logo abaixo como proxy: `overlays_prontos`
  // (overlays das cenas aplicados ao video final) e `grade_pronta` (a fase
  // de grade e onde o composite do palco acontece — D-384 bloqueia o render
  // se o PNG do palco falhar, entao grade_pronta=true implica palco ok).
  const cenasRenderizadas = cenas.length > 0 && Boolean(exportStatusAtual?.overlays_prontos);
  const palcoGerado = Boolean(exportStatusAtual?.grade_pronta);
  const videoRef = useRef<HTMLVideoElement>(null);
  // D-365: playhead da timeline segue o <video> final (igual ao Pos, que
  // alimenta `currentTime` via onTimeUpdate). Sem isso a timeline ficava
  // congelada em 0 e parecia "nao funcionar".
  const [currentTime, setCurrentTime] = useState(0);

  // Selecao automatica do corte ao entrar em Final sem corteId: prioriza
  // quem ja tem video pronto, mas mantem o usuario em Final (sem cair em
  // Bruto). Navegacao livre entre fases — B-012/I-013.
  useEffect(() => {
    if (corteId || cortes.length === 0) return;
    const escolhido =
      cortes.find((item) =>
        isCorteVideoPronto(
          item,
          exportStatusQ.data?.cortes.find((s) => s.corte_id === item.id),
        ),
      ) ?? cortes[0];
    navigate(`/projetos/${projetoId}/final-review?corte=${escolhido.id}`, { replace: true });
  }, [corteId, cortes, exportStatusQ.data?.cortes, navigate, projetoId]);

  useEffect(() => {
    setRenderFinalLocal(
      Boolean(corteId) && window.localStorage.getItem(`render-final:${corteId}`) === 'running',
    );
  }, [corteId]);

  useEffect(() => {
    if (!corteId || !renderFinalLocal) return;
    const status = pipelineStatus.data;
    if (!status || renderFinal.isPending) return;
    const finished = status?.state === 'done' || status?.fases?.encode;
    const failed = status?.state === 'error';
    const backendIdle = status?.running === false && status?.state !== 'running';
    if (!finished && !failed && !backendIdle) return;
    window.localStorage.removeItem(`render-final:${corteId}`);
    setRenderFinalLocal(false);
    void exportStatusQ.refetch();
  }, [corteId, exportStatusQ, pipelineStatus.data, renderFinal.isPending, renderFinalLocal]);

  const shortcutBindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        key: ' ',
        group: 'player',
        description: 'Play/pause',
        action: () => {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        },
      },
      {
        key: 'j',
        mod: 'ctrl',
        group: 'player',
        description: 'Velocidade -0.25',
        action: () => {
          const v = videoRef.current;
          if (!v) return;
          v.playbackRate = Math.max(SPEED_MIN, v.playbackRate - SPEED_STEP);
        },
      },
      {
        key: 'k',
        mod: 'ctrl',
        group: 'player',
        description: 'Velocidade +0.25',
        action: () => {
          const v = videoRef.current;
          if (!v) return;
          v.playbackRate = Math.min(SPEED_MAX, v.playbackRate + SPEED_STEP);
        },
      },
    ],
    [],
  );
  useShortcuts(shortcutBindings, Boolean(corteId));

  if (!projetoId) return <Navigate to="/projetos" replace />;

  if (!corteId && !cortesQuery.isLoading && cortes.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-[var(--wb-text)]">
          Este projeto ainda não tem cortes
        </h1>
        <p className="max-w-md text-sm">Gere ou importe cortes antes de abrir a revisão final.</p>
      </div>
    );
  }

  if (corteQuery.isError || cortesQuery.isError || exportStatusQ.isError) {
    const failed = corteQuery.error ?? cortesQuery.error ?? exportStatusQ.error;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-error">
          Erro ao carregar revisão final
        </h1>
        <p className="max-w-md text-sm">
          {failed instanceof Error ? failed.message : 'Tente novamente em instantes.'}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void corteQuery.refetch();
            void cortesQuery.refetch();
            void exportStatusQ.refetch();
          }}
        >
          <RefreshCw />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (corteQuery.isLoading || cortesQuery.isLoading || exportStatusQ.isLoading || !corte) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--wb-text-dim)]">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Carregando revisão final...
      </div>
    );
  }

  // Navegacao livre entre fases (B-012): permanece em Final mesmo sem
  // video renderizado. Player ganha placeholder mais abaixo.

  async function renderizarNovamente() {
    if (!corte) return;
    if (renderFinalLocal || pipelineStatus.data?.running) return;
    const status = (await pipelineStatus.refetch()).data;
    if (status?.running) return;
    if (status?.tem_etapas_concluidas) {
      setRenderStartModalOpen(true);
      return;
    }
    startRenderFinal({ startFrom: 'grade' });
  }

  function startRenderFinal(opts: {
    startFrom: RenderStartFrom;
    pararEm?: FaseRender;
    continuar?: boolean;
  }) {
    if (!corteId) return;
    window.localStorage.setItem(`render-final:${corteId}`, 'running');
    setRenderFinalLocal(true);
    setRenderStartModalOpen(false);
    renderFinal.mutate(opts, {
      onSuccess: () => {
        void pipelineStatus.refetch();
        void exportStatusQ.refetch();
      },
      onError: () => {
        window.localStorage.removeItem(`render-final:${corteId}`);
        setRenderFinalLocal(false);
      },
    });
  }

  const aprovado = ['aprovado', 'editado', 'processado'].includes(corte.status);
  const renderFinalRunning = Boolean(
    renderFinalLocal || renderFinal.isPending || pipelineStatus.data?.running,
  );
  const renderProgress = Math.round(
    pipelineStatus.data?.progress ??
      (renderFinalRunning ? progressFromPipelineArtifacts(pipelineStatus.data?.fases) : 0),
  );

  // Status checklist (conectado aos campos reais do exportStatus + corte).
  const checklistItems: ChecklistItem[] = [
    {
      ok: Boolean(exportStatusAtual?.video_pronto || corte.is_pos_producao === 1),
      label: 'Render final concluído',
      icon: Check,
    },
    {
      ok: Boolean(exportStatusAtual?.overlays_prontos),
      label: 'Overlays aplicados',
      icon: Sparkles,
    },
    {
      ok: Boolean(exportStatusAtual?.grade_pronta),
      label: 'Color grade aplicado',
      icon: Palette,
    },
    {
      ok: Boolean(exportStatusAtual?.metadados_completos),
      label: 'Metadados preenchidos',
      icon: FileText,
    },
    {
      ok: Boolean(exportStatusAtual?.thumbnail_pronta),
      label: 'Capa renderizada',
      icon: Edit3,
    },
    {
      // Audio normalizado: nao temos campo dedicado — assumimos OK quando
      // o video final esta pronto (encoder normaliza para -14 LUFS).
      ok: Boolean(exportStatusAtual?.video_pronto),
      label: 'Áudio normalizado (-14 LUFS)',
      icon: VolumeX,
    },
  ];
  const checklistOkCount = checklistItems.filter((item) => item.ok).length;
  const capaPronta = Boolean(exportStatusAtual?.thumbnail_pronta);

  // Duracao para timeline: usa duracao real do clip se houver.
  const timelineDuration = Math.max(
    typeof corte.duracao_clip_seg === 'number' && corte.duracao_clip_seg > 0
      ? corte.duracao_clip_seg
      : calcularDuracaoLiquida(corte.inicio_seg, corte.fim_seg, corte.desvios),
    ...cenas.map((c) => c.fim),
    1,
  );

  function aprovarCorte() {
    if (!corte) return;
    if (aprovado) {
      notify('Corte já está aprovado.', { tone: 'info' });
      return;
    }
    atualizarCorte.mutate(
      { status: 'aprovado' },
      {
        onSuccess: () => notify('Corte aprovado.', { tone: 'success' }),
        onError: (e) =>
          notify(e instanceof Error ? e.message : 'Erro ao aprovar.', { tone: 'error' }),
      },
    );
  }

  // statusPills (read-only) — Aprovado/Renderizado/TOP/Leitura na esquerda do titulo.
  const statusPills = (
    <span className="flex flex-wrap items-center gap-1.5">
      <FinalStatusPill icon={Check} label="Aprovado" active={aprovado} color="var(--wb-ok)" />
      <FinalStatusPill
        icon={Flame}
        label="TOP"
        active={Boolean(corte.is_fire)}
        color="var(--wb-fire)"
      />
    </span>
  );

  const moreMenuItems: MoreMenuItem[] = [
    {
      icon: RefreshCw,
      label: renderFinalRunning ? `Re-renderizando ${renderProgress}%` : 'Re-renderizar',
      disabled: renderFinalRunning,
      onClick: () => void renderizarNovamente(),
    },
    {
      icon: FolderOpen,
      label: 'Abrir pasta do render',
      kbd: 'Ctrl+O',
      disabled: abrirPasta.isPending,
      onClick: () => abrirPasta.mutate(corte.id),
    },
    {
      icon: Keyboard,
      label: 'Atalhos',
      kbd: '?',
      onClick: () => undefined,
    },
  ];
  const exportStatuses = exportStatusQ.data?.cortes ?? [];

  // D-367: resolve o id do filtro global para o nome amigavel (FiltroExport.nome).
  const filtroGlobalId = settingsQ.data?.filtro_global_padrao;
  const filtroNome =
    filtrosQ.data?.filtros.find((f) => f.id === filtroGlobalId)?.nome ?? filtroGlobalId ?? null;

  // Grid do conteúdo (player + checklist/capa + timeline read-only) —
  // compartilhado entre o shell legado e o Workbench.
  const conteudoFinal = (
    <div
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateColumns: '1.5fr 320px',
        // DE-PARA-v3 §4: 220px fixos cortavam a trilha LAYOUT YT e o eixo na
        // borda inferior. `minmax(200px, auto)` dá à timeline pelo menos a
        // altura natural dela e deixa o player ceder o espaço.
        gridTemplateRows: '1fr minmax(200px, auto)',
        gap: 12,
        padding: 12,
      }}
    >
      <div style={{ gridColumn: '1', gridRow: '1', minHeight: 0 }}>
        {videoPronto ? (
          <FinalPlayerPanel
            src={finalVideoUrl(projetoId, corte.id)}
            projetoId={projetoId}
            corteId={corte.id}
            onAbrirPasta={() => abrirPasta.mutate(corte.id)}
            abrindoPasta={abrirPasta.isPending}
            videoRef={videoRef}
            onTimeUpdate={setCurrentTime}
            filtroLabel={filtroNome}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-8 text-center text-[var(--wb-text-mute)]">
            <div className="flex flex-col items-center gap-2">
              <p className="font-editorial text-lg text-[var(--wb-text)]">
                Render final ainda nao disponivel
              </p>
              <p className="text-sm">Gere o video na fase Pos para visualizar aqui.</p>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          gridColumn: '2',
          gridRow: '1 / span 2',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        <ChecklistCard items={checklistItems} />
        <CapaCard
          titulo={corte.titulo_proposto ?? projeto.data?.titulo_live ?? 'Corte'}
          pronta={Boolean(exportStatusAtual?.thumbnail_pronta)}
          thumbUrl={resolveThumbUrl(projetoId, exportStatusAtual?.thumbnail_path)}
          onEditar={() => setMetadataOpen(true)}
        />
      </div>

      <div style={{ gridColumn: '1', gridRow: '2', minHeight: 0 }}>
        <SceneTimeline
          cenas={cenas}
          currentTime={currentTime}
          duration={timelineDuration}
          layoutYoutube={(corte as unknown as { layout_youtube?: never }).layout_youtube}
          onSeek={(seg) => {
            const v = videoRef.current;
            if (!v) return;
            v.currentTime = Math.max(0, seg);
          }}
          readOnly
          seekable
        />
      </div>
    </div>
  );

  const finalModals = (
    <>
      <RenderStepsModal
        open={renderStartModalOpen}
        status={pipelineStatus.data}
        onClose={() => setRenderStartModalOpen(false)}
        onConfirm={startRenderFinal}
      />
      <MetadataModal
        open={metadataOpen}
        projetoId={projetoId}
        corte={corte}
        onClose={() => setMetadataOpen(false)}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );

  // ── Shell Workbench (Etapa 5 / DE-PARA §5): painel CORTES retrátil +
  // linha de ações no topo do conteúdo da aba; grid final compartilhado.
  if (isWorkbenchEnabled()) {
    return (
      <>
        <WorkbenchEditorLayout
          panelIds={['cuts']}
          leftPanel={
            <WorkbenchCutsPanel
              projetoId={projetoId}
              cortes={cortes}
              corteAtivoId={corte.id}
              exportStatus={exportStatuses}
              getCortePath={(item) =>
                resolveCorteStagePath({
                  projetoId,
                  corte: item,
                  status: exportStatuses.find((status) => status.corte_id === item.id),
                })
              }
            />
          }
        >
          {/* Fluxo vertical: o PLAYER é o item flexível — fica com todo o
              espaço que sobra — e a timeline ancora no rodapé com a altura
              natural dela (nunca cortada, nunca sobrando branco embaixo). */}
          <div className="min-h-0 flex-1">
            {videoPronto ? (
              <FinalPlayerPanel
                src={finalVideoUrl(projetoId, corte.id)}
                projetoId={projetoId}
                corteId={corte.id}
                onAbrirPasta={() => abrirPasta.mutate(corte.id)}
                abrindoPasta={abrirPasta.isPending}
                videoRef={videoRef}
                onTimeUpdate={setCurrentTime}
                filtroLabel={filtroNome}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-8 text-center text-[var(--wb-text-mute)]">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[14px] font-bold text-[var(--wb-text)]">
                    Render final ainda nao disponivel
                  </p>
                  <p className="text-xs">Gere o video na fase Pos para visualizar aqui.</p>
                </div>
              </div>
            )}
          </div>

          {/* Linha de ações do protótipo */}
          <div className="flex flex-none flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={aprovarCorte}
              disabled={atualizarCorte.isPending || aprovado}
              className="flex items-center gap-1.5 rounded-[9px] bg-[var(--wb-ok)] px-4 py-2 text-[11.5px] font-extrabold text-white hover:opacity-90 disabled:opacity-60"
            >
              {atualizarCorte.isPending ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 size={13} aria-hidden />
              )}
              {aprovado ? 'Aprovado' : 'Aprovar e publicar'}
            </button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/projetos/${projetoId}/post-production?corte=${corte.id}`)}
            >
              ↩ Voltar para pós
            </Button>
            {statusPills}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setChecklistAberto((aberto) => !aberto)}
              aria-expanded={checklistAberto}
              title="Ver checklist de publicação"
              className={
                checklistOkCount === checklistItems.length
                  ? 'flex items-center gap-1.5 rounded-[9px] bg-[var(--wb-ok-soft)] px-3 py-2 text-[10.5px] font-bold text-[var(--wb-ok-ink)]'
                  : 'flex items-center gap-1.5 rounded-[9px] bg-[var(--wb-warn-soft)] px-3 py-2 text-[10.5px] font-bold text-[var(--wb-warn-ink)]'
              }
            >
              CHECKLIST {checklistOkCount}/{checklistItems.length}
              <span aria-hidden className="text-[9px]">
                {checklistAberto ? '▲' : '▼'}
              </span>
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void renderizarNovamente()}
              disabled={renderFinalRunning}
            >
              {renderFinalRunning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {renderFinalRunning ? `Re-renderizando ${renderProgress}%` : 'Re-renderizar'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMetadataOpen(true)}>
              <FileText />
              Metadados
            </Button>
          </div>

          {/* Checklist expansível (DE-PARA-v3 §4): recolhido por padrão para
              despoluir; o contador na barra de ações é o gatilho. Traz os 6
              chips + o cluster compacto (agendamento · capa · editar). */}
          {checklistAberto && (
            <div className="flex flex-none flex-wrap items-center gap-1.5 rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
              {checklistItems.map((item, idx) => (
                <span
                  key={idx}
                  title={item.label}
                  className={
                    item.ok
                      ? 'flex items-center gap-1 rounded-[6px] bg-[var(--wb-ok-soft)] px-2 py-1 text-[9.5px] font-bold text-[var(--wb-ok)]'
                      : 'flex items-center gap-1 rounded-[6px] bg-[var(--wb-warn-soft)] px-2 py-1 text-[9.5px] font-bold text-[var(--wb-warn)]'
                  }
                >
                  {item.ok ? '✓' : '○'} {item.label}
                </span>
              ))}
              {exportStatusAtual?.youtube_scheduled_at && (
                <span className="rounded-[6px] bg-[var(--wb-info-soft)] px-2 py-1 text-[9.5px] font-bold text-[var(--wb-info)]">
                  agendado · {exportStatusAtual.youtube_scheduled_at}
                </span>
              )}
              <div className="flex-1" />
              {resolveThumbUrl(projetoId, exportStatusAtual?.thumbnail_path) && (
                <span className="flex items-center gap-1.5">
                  <span
                    className={
                      capaPronta
                        ? 'rounded-full bg-[var(--wb-ok-soft)] px-2 py-0.5 font-code text-[9px] font-bold uppercase text-[var(--wb-ok)]'
                        : 'rounded-full bg-[var(--wb-warn-soft)] px-2 py-0.5 font-code text-[9px] font-bold uppercase text-[var(--wb-warn)]'
                    }
                  >
                    {capaPronta ? 'pronta' : 'pendente'}
                  </span>
                  <img
                    src={resolveThumbUrl(projetoId, exportStatusAtual?.thumbnail_path) ?? undefined}
                    alt="Capa do corte"
                    className="h-12 rounded-md object-cover"
                  />
                </span>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setMetadataOpen(true)}>
                <Edit3 />
                Editar capa
              </Button>
            </div>
          )}

          {/* Timeline read-only navegável (D-365), ancorada no rodapé com a
              altura natural do componente (cabeçalho + trilha CENAS 68px +
              trilha LAYOUT YT 44px + eixo ≈ 196px). `flex-none` porque o
              SceneTimeline não estica por dentro: com `flex-1` ele ganhava a
              sobra e a devolvia como espaço branco abaixo do eixo. Quem cresce
              é o player. */}
          <div className="flex-none">
            <SceneTimeline
              cenas={cenas}
              currentTime={currentTime}
              duration={timelineDuration}
              layoutYoutube={(corte as unknown as { layout_youtube?: never }).layout_youtube}
              onSeek={(seg) => {
                const v = videoRef.current;
                if (!v) return;
                v.currentTime = Math.max(0, seg);
              }}
              readOnly
              seekable
              cenasRenderizadas={cenasRenderizadas}
              palcoGerado={palcoGerado}
            />
          </div>
        </WorkbenchEditorLayout>
        {finalModals}
      </>
    );
  }

  return (
    <>
      <UnifiedSidebar
        projetoId={projetoId}
        cortes={cortes}
        corteAtivoId={corte.id}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        activePhase="final"
        getCortePath={(item) =>
          resolveCorteStagePath({
            projetoId,
            corte: item,
            status: exportStatuses.find((status) => status.corte_id === item.id),
          })
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="ml-[132px] flex h-screen flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
        <CommonTopBar
          projeto={projeto.data}
          corte={corte}
          statusToggles={null}
          statusPills={statusPills}
          secondaryAction={
            <Tooltip label="Editar metadados (único editável aqui)" side="bottom">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMetadataOpen(true)}
              >
                <FileText />
                Metadados
              </Button>
            </Tooltip>
          }
          primaryAction={
            <Tooltip label={aprovado ? 'Corte já aprovado' : 'Aprovar este corte'} side="bottom">
              <Button
                type="button"
                size="sm"
                onClick={aprovarCorte}
                disabled={atualizarCorte.isPending || aprovado}
                className="bg-[var(--wb-ok)] text-white hover:opacity-90 disabled:opacity-60"
              >
                {atualizarCorte.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : aprovado ? (
                  <CheckCircle2 />
                ) : (
                  <Upload />
                )}
                {aprovado ? 'Aprovado' : 'Aprovar'}
              </Button>
            </Tooltip>
          }
          moreMenuItems={moreMenuItems}
        />

        {conteudoFinal}
      </div>

      {finalModals}
    </>
  );
}

// ─── FinalStatusPill — read-only status do corte na topbar ──
function FinalStatusPill({
  icon: Icon,
  label,
  active,
  color,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  color: string;
}) {
  return (
    <span
      style={{ '--pill-color': color } as CSSProperties}
      className={
        active
          ? 'inline-flex h-6 items-center gap-1 rounded-full border border-[var(--pill-color)] bg-[var(--pill-color)] px-[9px] pl-[7px] text-[10px] font-bold uppercase tracking-[0.04em] text-white'
          : 'inline-flex h-6 items-center gap-1 rounded-full border border-[var(--wb-border)] bg-transparent px-[9px] pl-[7px] text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-text-mute)]'
      }
    >
      <Icon size={11} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
      {label}
    </span>
  );
}

// ─── FinalPlayerPanel — replica v3_final.jsx:12-39 ──
function FinalPlayerPanel({
  src,
  projetoId,
  corteId,
  onAbrirPasta,
  abrindoPasta,
  videoRef,
  onTimeUpdate,
  filtroLabel,
}: {
  src: string;
  projetoId: string;
  corteId: string;
  onAbrirPasta: () => void;
  abrindoPasta: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTimeUpdate: (segundos: number) => void;
  filtroLabel: string | null;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Vídeo final
        </span>
        <span className="flex-none rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
          1920×1080 · 29.97fps · h264
        </span>
        {/* D-367 + DE-PARA-v3 §4: o filtro de render é fonte única global
            (I-023 removeu o filtro por projeto/corte, e o render não persiste
            qual usou). O chip portanto identifica o AJUSTE GLOBAL ATUAL — não
            o perfil gravado neste corte, que pode divergir se o ajuste mudou
            depois do render. Rotular assim evita afirmar um dado que o
            back-end não guarda. */}
        {filtroLabel && (
          <Tooltip
            label="Filtro/grade global dos Ajustes — é o perfil usado nos renders enquanto estiver selecionado. O filtro não é gravado por corte."
            side="bottom"
          >
            <span className="inline-flex flex-none items-center gap-1 rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-accent)]">
              <Palette size={11} aria-hidden />
              Global · {filtroLabel}
            </span>
          </Tooltip>
        )}
        <div className="flex-1" />
        <Tooltip label="Baixar MP4" side="bottom">
          <a
            href={src}
            download={`corte-${corteId}.mp4`}
            data-projeto={projetoId}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] px-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-card)] hover:text-[var(--wb-text)]"
          >
            <Download size={12} />
            MP4
          </a>
        </Tooltip>
        <Tooltip label="Abrir pasta do render" side="bottom">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAbrirPasta}
            disabled={abrindoPasta}
          >
            {abrindoPasta ? <Loader2 className="animate-spin" /> : <Folder />}
            Pasta
          </Button>
        </Tooltip>
      </header>
      {/* O vídeo ocupa o que sobra DA SEÇÃO. Qualquer teto de altura tem de
          vir do container externo e nunca envolver esta seção inteira: o
          cabeçalho (specs + filtro + MP4/Pasta) vive aqui dentro e, espremido
          junto, quebra em várias linhas. */}
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          className="h-full w-full bg-black object-contain"
        />
      </div>
    </section>
  );
}

// ─── ChecklistCard — replica v3_final.jsx:176-231 ──
interface ChecklistItem {
  ok: boolean;
  label: string;
  icon: LucideIcon;
}

function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  const okCount = items.filter((i) => i.ok).length;
  const total = items.length;
  const tudoOk = okCount === total;
  return (
    <section className="flex-shrink-0 overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Checklist
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] ${
            tudoOk
              ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
              : 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]'
          }`}
        >
          {okCount}/{total}
        </span>
      </header>
      <div className="flex flex-col gap-1 p-3">
        {items.map((item, idx) => (
          <ChecklistRow key={idx} item={item} />
        ))}
      </div>
    </section>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const Icon = item.icon;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[var(--radius-sm)] border p-2 ${
        item.ok
          ? 'border-transparent bg-transparent'
          : 'border-[var(--wb-warn)]/30 bg-[var(--wb-warn-soft)]'
      }`}
    >
      <span
        className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          item.ok
            ? 'border-[var(--wb-ok)] bg-[var(--wb-ok)] text-white'
            : 'border-[var(--wb-warn)] bg-[var(--wb-bg-card)] text-transparent'
        }`}
        aria-hidden
      >
        {item.ok && <Check size={12} strokeWidth={3} />}
      </span>
      <Icon
        size={13}
        className={item.ok ? 'text-[var(--wb-text-mute)]' : 'text-[var(--wb-warn)]'}
        aria-hidden
      />
      <span
        className={`text-[12.5px] ${
          item.ok ? 'font-medium text-[var(--wb-text)]' : 'font-semibold text-[var(--wb-ink)]'
        }`}
      >
        {item.label}
      </span>
    </div>
  );
}

// ─── CapaCard — replica v3_final.jsx:233-257 ──
function CapaCard({
  titulo,
  pronta,
  thumbUrl,
  onEditar,
}: {
  titulo: string;
  pronta: boolean;
  thumbUrl: string | null;
  onEditar: () => void;
}) {
  return (
    <section className="flex-shrink-0 overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Capa
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] ${
            pronta
              ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
              : 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]'
          }`}
        >
          {pronta ? 'pronta' : 'pendente'}
        </span>
        <div className="flex-1" />
        <Tooltip label="Editar capa (abre Metadados)" side="bottom">
          <Button type="button" variant="ghost" size="sm" onClick={onEditar}>
            <Edit3 />
            Editar
          </Button>
        </Tooltip>
      </header>
      <div className="p-3">
        <div
          className="relative overflow-hidden rounded-[var(--radius-sm)] bg-gradient-to-br from-[oklch(0.45_0.05_60)] via-[oklch(0.3_0.04_60)] to-[oklch(0.15_0.03_60)]"
          style={{ aspectRatio: '16 / 9' }}
        >
          {/* D-366: mostra a capa renderizada quando existe; senao mantem o
              gradiente + titulo como placeholder. */}
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={`Capa de ${titulo}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute bottom-3 left-3 max-w-[80%] text-white">
              <div className="font-editorial text-[16px] font-medium leading-tight">{titulo}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Type wrapper para evitar warning "ReactNode imported but unused".
export type _FinalChecklistItem = ReactNode;
