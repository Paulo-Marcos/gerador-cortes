import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FolderOpen, Keyboard, Loader2, Play } from 'lucide-react';
import { useAbrirPasta, useExportStatus, useProjeto } from '@/hooks/useProjetoDetalhe';
import {
  type RenderStartFrom,
  useCorte,
  useCortesProjeto,
  usePipelineStatus,
  useRenderizarRemotion,
  useStatusBruto,
  useStudioUrl,
} from '@/hooks/useEditor';
import { finalVideoUrl, gradedVideoUrl, rawVideoBustedUrl } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import type { CenaRemotion } from '@/types/models';
import type { PlayerHandle } from '@/features/editor/fase1/PlayerPanel';
import { EditorFase2 } from '@/features/editor/fase2/EditorFase2';
import { useShortcuts, type ShortcutBinding } from '@/features/editor/shortcuts';
import { shortcutFromRegistry } from '@/features/editor/shortcutsRegistry';
import { UnifiedSidebar } from '@/features/editor/UnifiedSidebar';
import { CommonTopBar, type MoreMenuItem } from '@/features/editor/CommonTopBar';
import { PosTopbarExtra, type PosStep, type VideoTipo } from '@/features/editor/PosTopbarExtra';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import { SettingsModal } from '@/components/layout/SettingsModal';
import { RenderStepsModal } from './RenderStepsModal';
import type { FaseRender } from './renderEtapas';

// Constante fora do componente p/ evitar useMemo + early-return (rules-of-hooks).
const STEP_DONE_DEFAULT: Set<PosStep> = new Set([1]);

// Atalhos Ctrl+J/K (F-041): mesmos limites usados na tela Bruta.
const SPEED_MIN = 0.25;
const SPEED_MAX = 4;
const SPEED_STEP = 0.25;
// I-029 v2: setas movem 3s; mesmo step usado na tela Bruta para a UX nao mudar.
const SEEK_STEP_SEG = 3;
import {
  pickPostProductionEntryCut,
  resolveCorteStagePath,
  resolveRenderCompletionPath,
  parseCenasPayload,
  progressFromPipelineArtifacts,
} from './postProductionNavigation';

export function ScenesPostProductionPage() {
  const { id: projetoId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const corteId = searchParams.get('corte') ?? '';
  const forcePhase2 = searchParams.get('fase') === '2';

  const projeto = useProjeto(projetoId);
  const cortesQuery = useCortesProjeto(projetoId);
  const corteQuery = useCorte(corteId);
  const exportStatusQ = useExportStatus(projetoId);
  const statusBruto = useStatusBruto(corteId);

  const [cenas, setCenas] = useState<CenaRemotion[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  // Cache-buster do <video>: bumpado automaticamente quando a geração do
  // bruto termina (status -> 'pronto') para o Remotion Player remontar com a
  // URL nova (via `key={src}` no Player) e re-fetchar o arquivo do disco.
  const [videoBust, setVideoBust] = useState<number>(() => Date.now());
  const [renderFinalLocal, setRenderFinalLocal] = useState(
    () => Boolean(corteId) && window.localStorage.getItem(`render-final:${corteId}`) === 'running',
  );
  const [renderStartModalOpen, setRenderStartModalOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ultimoStatusBrutoRef = useRef<string | undefined>(undefined);
  const gradeFaseRef = useRef(false);
  const playerRef = useRef<PlayerHandle>(null);
  const { notify: notifyToast } = useToast();

  useEffect(() => {
    const anterior = ultimoStatusBrutoRef.current;
    const atual = statusBruto.data?.status;
    ultimoStatusBrutoRef.current = atual;
    const eraProcessando = anterior === 'cortando' || anterior === 'processando';
    if (eraProcessando && atual === 'pronto') {
      setVideoBust(Date.now());
    }
    // Transitou para erro: notificar o usuário com a mensagem real do backend.
    if (atual && atual.startsWith('erro:') && anterior !== atual) {
      const msg = atual.replace(/^erro:\s*/, '');
      notifyToast(`Geração de bruto falhou: ${msg}`, { tone: 'error' });
    }
  }, [statusBruto.data?.status, notifyToast]);

  const cortes = useMemo(() => cortesQuery.data ?? [], [cortesQuery.data]);
  const corte = corteQuery.data;
  const renderFinal = useRenderizarRemotion(corteId);
  const pipelineStatus = usePipelineStatus(corteId, renderFinalLocal);
  const abrirPasta = useAbrirPasta();
  const studioUrl = useStudioUrl(corteId);

  const payload = useMemo(() => parseCenasPayload(corte?.cenas_remotion), [corte?.cenas_remotion]);

  useEffect(() => {
    setCenas(payload.cenas);
    setCurrentTime(0);
  }, [payload.cenas, corteId]);

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

    // Render concluído: jogar o usuário direto na tela final, mesmo com
    // ?fase=2 preservado, porque aqui o vídeo passou a estar pronto.
    const renderTarget = resolveRenderCompletionPath({
      projetoId,
      corteId,
      finished: Boolean(finished),
    });
    if (renderTarget) navigate(renderTarget, { replace: true });
  }, [
    corteId,
    exportStatusQ,
    navigate,
    pipelineStatus.data,
    projetoId,
    renderFinal.isPending,
    renderFinalLocal,
  ]);

  // I-030: assim que pipelineStatus reporta fases.grade=true, o backend ja
  // deletou o raw e zerou corte.arquivo_clip_path. Forca o refetch do
  // exportStatus para o checklist/sidebar refletirem grade_pronta sem
  // esperar o poll de 8s.
  useEffect(() => {
    const gradeAtual = Boolean(pipelineStatus.data?.fases?.grade);
    if (gradeAtual && !gradeFaseRef.current) {
      void exportStatusQ.refetch();
    }
    gradeFaseRef.current = gradeAtual;
  }, [exportStatusQ, pipelineStatus.data?.fases?.grade]);

  useEffect(() => {
    if (corteId || cortes.length === 0) return;
    const escolhido = pickPostProductionEntryCut(cortes, exportStatusQ.data?.cortes) ?? cortes[0];
    if (!escolhido) return;
    navigate(
      `/projetos/${projetoId}/post-production?corte=${escolhido.id}${forcePhase2 ? '&fase=2' : ''}`,
      {
        replace: true,
      },
    );
  }, [corteId, cortes, exportStatusQ.data?.cortes, forcePhase2, navigate, projetoId]);

  // I-025 (freeze player na render): congela a URL do player enquanto a
  // render esta rodando. Sem isso, o swap raw→graded mid-render faz o
  // playerKey do CenaPlayerPanel mudar e o Remotion Player remonta no meio
  // da escrita do graded.mp4 → tela preta ate a render terminar. Hooks
  // declarados aqui (antes dos early returns) para nao violar Rules of
  // Hooks; o snapshot real do src acontece via `liveSrcRef.current = videoSrc`
  // mais abaixo, e o effect le esse ref no momento do flip de runtime.
  const liveSrcRef = useRef<string>('');
  const [pinnedSrc, setPinnedSrc] = useState<string | null>(null);
  useEffect(() => {
    const running = Boolean(
      renderFinalLocal || pipelineStatus.data?.running || renderFinal.isPending,
    );
    if (running) {
      setPinnedSrc((current) => current ?? (liveSrcRef.current || null));
    } else {
      setPinnedSrc(null);
    }
  }, [renderFinalLocal, pipelineStatus.data?.running, renderFinal.isPending]);

  const seekRelativo = (delta: number) => {
    const player = playerRef.current;
    if (!player) return;
    const t = player.getCurrentTime();
    player.seekTo(Math.max(0, t + delta));
  };

  const shortcutBindings = useMemo<ShortcutBinding[]>(
    () => [
      shortcutFromRegistry('player.togglePlay', () => playerRef.current?.togglePlay()),
      shortcutFromRegistry('player.speedDown', () =>
        setPlaybackRate((r) => Math.max(SPEED_MIN, r - SPEED_STEP)),
      ),
      shortcutFromRegistry('player.speedUp', () =>
        setPlaybackRate((r) => Math.min(SPEED_MAX, r + SPEED_STEP)),
      ),
      shortcutFromRegistry('player.seekBackward3s', () => seekRelativo(-SEEK_STEP_SEG)),
      shortcutFromRegistry('player.seekForward3s', () => seekRelativo(SEEK_STEP_SEG)),
    ],
    [],
  );
  useShortcuts(shortcutBindings, Boolean(corteId));

  if (!projetoId) return <Navigate to="/projetos" replace />;

  if (!corteId && !cortesQuery.isLoading && cortes.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-[var(--wb-text)]">
          Este projeto ainda nao tem cortes
        </h1>
        <p className="max-w-md text-sm">Gere ou importe cortes antes de abrir a fase de cenas.</p>
      </div>
    );
  }

  if (corteQuery.isLoading || cortesQuery.isLoading || !corte) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center text-[var(--wb-text-dim)]">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Carregando cenas...
      </div>
    );
  }

  function abrirStudio() {
    // Abre tab placeholder SÍNCRONO dentro do click handler — browser não
    // bloqueia pop-up porque é user gesture direto. Depois redireciona com
    // a URL real quando a mutation resolver. Sem `noopener` para conseguir
    // setar `.location.href` no popup. Fallback: navega no mesmo tab.
    const popup = window.open('about:blank', '_blank');
    studioUrl.mutate(undefined, {
      onSuccess: (data) => {
        if (!data.studio_url) {
          popup?.close();
          return;
        }
        if (popup) {
          popup.location.href = data.studio_url;
        } else {
          window.location.href = data.studio_url;
        }
      },
      onError: () => {
        popup?.close();
      },
    });
  }

  async function renderizarFinal() {
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

  const renderFinalRunning = Boolean(
    renderFinalLocal || pipelineStatus.data?.running || renderFinal.isPending,
  );
  const renderFinalProgress = Math.round(
    pipelineStatus.data?.progress ??
      (renderFinalRunning ? progressFromPipelineArtifacts(pipelineStatus.data?.fases) : 0),
  );

  // videoSrc com fallback final -> graded -> raw. O retention apaga o
  // clip_raw assim que o graded fica pronto; sem este fallback o <video>
  // recebe 404 e o player fica preto entre fases (I-014).
  // I-030: pipelineStatus reporta `fases.grade` em ~2s; useExportStatus poll
  // em 8s. Sem `phaseGradeDone` a janela entre retention e o proximo poll do
  // exportStatus deixa o videoSrc apontando pro raw recem-deletado.
  const exportEntry = exportStatusQ.data?.cortes.find((c) => c.corte_id === corte.id);
  const phaseGradeDone = Boolean(pipelineStatus.data?.fases?.grade);
  const gradeDisponivel = Boolean(exportEntry?.grade_pronta) || phaseGradeDone;
  const videoSrc = exportEntry?.video_pronto
    ? `${finalVideoUrl(projetoId, corte.id)}?v=${videoBust}`
    : gradeDisponivel
      ? `${gradedVideoUrl(projetoId, corte.id)}?v=${videoBust}`
      : rawVideoBustedUrl(corte.id, videoBust);

  // I-025 (freeze player na render): video estavel — pinnedSrc declarado
  // como hook no topo do componente (antes dos early returns); aqui so
  // compomos o valor efetivo apos videoSrc estar resolvido.
  liveSrcRef.current = videoSrc;
  const videoSrcEstavel = pinnedSrc ?? videoSrc;

  // Marcador de tipo: TOP > LEITURA > null (TOP tem prioridade visual)
  const videoTipo: VideoTipo = corte.is_fire ? 'top' : corte.is_leitura ? 'leitura' : null;
  // Stepper: passo ativo. Render rodando = 4 Renderizar; senao = 2 Cenas.
  // Passo 1 (Metadados) sempre marcado como done — corte ja foi classificado no Bruto
  // e os metadados podem ser preenchidos via modal a qualquer momento.
  const stepActive: PosStep = renderFinalRunning ? 4 : 2;
  const stepDone: Set<PosStep> = STEP_DONE_DEFAULT;

  const moreMenuItems: MoreMenuItem[] = [
    {
      icon: FolderOpen,
      label: 'Abrir pasta',
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

  return (
    <>
      <UnifiedSidebar
        projetoId={projetoId}
        cortes={cortes}
        corteAtivoId={corte.id}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        activePhase="pos"
        getCortePath={(item) =>
          resolveCorteStagePath({
            projetoId,
            corte: item,
            status: exportStatuses.find((status) => status.corte_id === item.id),
            forcePhase2,
          })
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="ml-[132px] flex h-screen flex-col overflow-hidden bg-[var(--wb-bg)]">
        <CommonTopBar
          projeto={projeto.data}
          corte={corte}
          statusToggles={null}
          extra={
            <PosTopbarExtra
              tipo={videoTipo}
              active={stepActive}
              done={stepDone}
              onMetadadosClick={() => setMetadataOpen(true)}
            />
          }
          primaryAction={
            <Tooltip
              label={renderFinalRunning ? `Renderizando ${renderFinalProgress}%` : 'Renderizar'}
              side="bottom"
            >
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={renderizarFinal}
                disabled={renderFinalRunning}
              >
                {renderFinalRunning ? <Loader2 className="animate-spin" /> : <Play />}
                {renderFinalRunning ? `Renderizando ${renderFinalProgress}%` : 'Renderizar'}
              </Button>
            </Tooltip>
          }
          moreMenuItems={moreMenuItems}
        />

        <div className="min-h-0 flex-1 p-4">
          <EditorFase2
            videoSrc={videoSrcEstavel}
            modoLabel="Cenas"
            corte={corte}
            cenas={cenas}
            formato={payload.formato}
            paleta={payload.paleta}
            playerRef={playerRef}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onSeek={(seg) => playerRef.current?.seekTo(seg)}
            onCenasChange={setCenas}
            onAbrirStudio={abrirStudio}
            abrindoStudio={studioUrl.isPending}
            playbackRate={playbackRate}
          />
        </div>
      </div>

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
}
