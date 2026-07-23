import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAbrirPasta, useExportStatus, useProjeto } from '@/hooks/useProjetoDetalhe';
import {
  corteKey,
  useAdicionarDesvio,
  useAtualizarCorte,
  useCorte,
  useCortesProjeto,
  useDeletarCorte,
  useDividirCorte,
  useGerarBruto,
  useGerarMetadadosClaude,
  useGerarTrechosClaude,
  useRemoverDesvio,
  useSincronizarTranscricao,
  useStatusBruto,
  useToggleFire,
  useToggleLeitura,
} from '@/hooks/useEditor';
import { api, audioProxyUrl, waveformPeaksUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Clock,
  FolderOpen,
  Headphones,
  Info,
  Keyboard,
  Loader2,
  RefreshCw,
  Save,
  Scissors,
} from 'lucide-react';
import type { Corte, Desvio } from '@/types/models';
import { EditorFase1 } from './fase1/EditorFase1';
import { PlayerPanel, type PlayerHandle } from './fase1/PlayerPanel';
import { TimelinePanel } from './fase1/TimelinePanel';
import { RightTabsPanel } from './fase1/RightTabsPanel';
import { TrechosManualModal } from './fase1/TrechosManualModal';
import { BrutoContextStrip } from './fase1/BrutoContextStrip';
import { AudioSyncControl, MAX_MS, MIN_MS, STEP_FINO } from './fase1/AudioSyncControl';
import { BrutoStepsDropdown } from './BrutoStepsDropdown';
import { PanelShell } from '@/components/workbench/PanelShell';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { WorkbenchCutsPanel } from './WorkbenchCutsPanel';
import { PlayerCap, WorkbenchEditorLayout } from './WorkbenchEditorLayout';
import {
  OPCOES_REGERAR_VAZIAS,
  planejarRegeracaoBruto,
  type RegerarBrutoOpcoes,
} from './regerarBrutoPlan';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { useShortcuts, type ShortcutBinding } from './shortcuts';
import { shortcutFromRegistry } from './shortcutsRegistry';
import { useEditHistory } from './useEditHistory';
import { calcularDuracaoLiquida, hmsParaSeg, segParaHms, segParaMmSs } from './timeUtils';
import { selectDesvioIdxByTime } from './fase1/desvioUtils';
import { UnifiedSidebar } from './UnifiedSidebar';
import { CommonTopBar, StatusToggleRow, type MoreMenuItem } from './CommonTopBar';
import { SettingsModal } from '@/components/layout/SettingsModal';
import {
  applyDesvioChange,
  mergeDirtyPatch,
  resolveWaveformWindow,
  type WaveformWindow,
} from './editorEditState';
import {
  postProductionPath,
  resolveCorteStagePath,
} from '@/features/post-production/postProductionNavigation';

const APROVADO_STATUS_SET = new Set<Corte['status']>(['aprovado', 'editado', 'processado']);

function findPreviousApprovedCorte(cortes: Corte[], corte: Corte): Corte | null {
  return (
    cortes
      .filter(
        (item) =>
          item.id !== corte.id &&
          item.numero < corte.numero &&
          APROVADO_STATUS_SET.has(item.status),
      )
      .sort((a, b) => b.numero - a.numero)[0] ?? null
  );
}

function findNextCorte(cortes: Corte[], corte: Corte): Corte | null {
  return (
    cortes
      .filter((item) => item.id !== corte.id && item.numero > corte.numero)
      .sort((a, b) => a.numero - b.numero)[0] ?? null
  );
}

const VIDEOS_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api'
).replace(/\/api$/, '');

const SPEED_MIN = 0.25;
const SPEED_MAX = 4;
const WAVEFORM_PRELOAD_BEFORE_SEC = 60;
const WAVEFORM_PRELOAD_AFTER_SEC = 300;

function appendQueryParams(url: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${search}`;
}

// Botão dentro do cluster de ferramentas do Bruto: sem borda e sem fundo
// próprios (quem tem é o cluster), tamanho igual ao dos vizinhos. A cor do
// glifo vem de fora, por ferramenta.
const FERRAMENTA_CLASS =
  'flex aspect-square min-w-[24px] flex-[0_1_34px] items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--wb-bg-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:pointer-events-none disabled:opacity-40';

export function EditorPage() {
  const { id: projetoId = '', corteId = '' } = useParams<{ id: string; corteId: string }>();
  const navigate = useNavigate();

  const qc = useQueryClient();
  const { notify: notifyToast } = useToast();
  const projeto = useProjeto(projetoId);
  const cortesQuery = useCortesProjeto(projetoId);
  const corteQuery = useCorte(corteId);
  const exportStatusQ = useExportStatus(projetoId);
  const statusBruto = useStatusBruto(corteId);

  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trechosManualOpen, setTrechosManualOpen] = useState(false);
  const [intervaloAberto, setIntervaloAberto] = useState(false);
  // AUDITORIA-v2 §2/§5/§6 (CP2): toggles da toolbar do Workbench. Começam
  // FECHADOS — Sincronia/Tempos ficam ocultos por padrão (só o estado do
  // ícone muda nesta etapa; a próxima liga a visibilidade de
  // BrutoContextStrip/AudioSyncControl a partir destes mesmos booleans).
  const [temposAbertos, setTemposAbertos] = useState(false);
  const [sincroniaAberta, setSincroniaAberta] = useState(false);
  // Painel "passos do bruto" (BrutoStepsDropdown), agora aberto pelo ícone
  // ⟳ da toolbar (controlado por fora — ver CP2).
  const [brutoDropdownOpen, setBrutoDropdownOpen] = useState(false);
  // Trecho comeca DESTRAVADO por default (decisao Paulo): usuario pode
  // gerenciar tamanho dos trechos na waveform sem precisar destravar manualmente.
  // Trocar de corte reseta para destravado (caso o usuario tenha travado e mudado).
  const [trechoLocked, setTrechoLocked] = useState(false);
  const [pointerMode, setPointerMode] = useState(true);
  const [smartPlay, setSmartPlay] = useState(false);
  const [selectedDesvioIdx, setSelectedDesvioIdx] = useState<number | null>(null);
  const [gerandoBrutoCorteId, setGerandoBrutoCorteId] = useState<string | null>(null);
  const selectedDesvioIdxRef = useRef<number | null>(null);
  useEffect(() => {
    selectedDesvioIdxRef.current = selectedDesvioIdx;
  }, [selectedDesvioIdx]);
  const [waveformRefreshKey, setWaveformRefreshKey] = useState(0);
  // D-361: histórico das edições locais (dirty) com Ctrl+Z / Ctrl+Y.
  const editHistory = useEditHistory<Partial<Corte>>({});
  const dirty = editHistory.present;
  const { reset: resetEditHistory } = editHistory;
  const waveformWindowRef = useRef<WaveformWindow | null>(null);
  const playerRef = useRef<PlayerHandle>(null);

  const corte = corteQuery.data;
  const cortes = useMemo(() => cortesQuery.data ?? [], [cortesQuery.data]);
  const corteUI: Corte | null = useMemo(
    () => (corte ? { ...corte, ...dirty } : null),
    [corte, dirty],
  );
  const isDirty = Object.keys(dirty).length > 0;

  // Contexto do BrutoContextStrip — corte anterior aprovado, proximo corte,
  // duracoes. Computados antes de qualquer early return p/ respeitar rules-of-hooks.
  const previousCut = useMemo(
    () => (corteUI ? findPreviousApprovedCorte(cortes, corteUI) : null),
    [cortes, corteUI],
  );
  const nextCut = useMemo(
    () => (corteUI ? findNextCorte(cortes, corteUI) : null),
    [cortes, corteUI],
  );
  const liquidoSeg = useMemo(
    () =>
      corteUI
        ? calcularDuracaoLiquida(corteUI.inicio_seg, corteUI.fim_seg, corteUI.desvios ?? [])
        : 0,
    [corteUI],
  );
  const exportStatusAtual = exportStatusQ.data?.cortes.find(
    (status) => status.corte_id === corteUI?.id,
  );
  // exportStatus só lista APROVADO/EDITADO/PROCESSADO. is_pos_producao do
  // próprio corte cobre cortes em outros status que já tem video.mp4 no disco.
  const videoPronto = Boolean(exportStatusAtual?.video_pronto || corteUI?.is_pos_producao === 1);
  const brutoPronto = Boolean(
    statusBruto.data?.clip_gerado ||
    exportStatusAtual?.raw_pronto ||
    videoPronto ||
    corteUI?.arquivo_clip_path,
  );
  const brutoStatusAtual: 'idle' | 'processando' | 'concluido' | 'erro' = (() => {
    const s = statusBruto.data?.status;
    if (s === 'processando' || s === 'cortando') return 'processando';
    if (s === 'erro' || s?.startsWith('erro:')) return 'erro';
    if (brutoPronto) return 'concluido';
    return 'idle';
  })();

  const atualizarCorte = useAtualizarCorte(corteId, projetoId);
  const toggleFire = useToggleFire(corteId, projetoId);
  const toggleLeitura = useToggleLeitura(corteId, projetoId);
  const gerarBruto = useGerarBruto(corteId, projetoId);
  const gerarMetadadosClaude = useGerarMetadadosClaude(corteId);
  const gerarTrechosClaude = useGerarTrechosClaude(corteId, projetoId);
  const sincTrans = useSincronizarTranscricao(corteId);
  const adicionarDesvio = useAdicionarDesvio(corteId);
  const removerDesvio = useRemoverDesvio(corteId);
  const dividirCorte = useDividirCorte(corteId, projetoId);
  const abrirPasta = useAbrirPasta();
  const brutoMutationPendenteNoCorteAtual = gerarBruto.isPending && gerandoBrutoCorteId === corteId;

  const brutoOcupado = () =>
    !corteId || brutoStatusAtual === 'processando' || brutoMutationPendenteNoCorteAtual;

  const dispararBruto = (opts?: Parameters<typeof gerarBruto.mutate>[0]) => {
    const corteIdSolicitado = corteId;
    setGerandoBrutoCorteId(corteIdSolicitado);
    gerarBruto.mutate(opts, {
      onSettled: () => {
        setGerandoBrutoCorteId((atual) => (atual === corteIdSolicitado ? null : atual));
      },
    });
  };

  // F-038 — 1ª geração (corte sem bruto): cadeia completa. Dispara metadados via
  // Claude em paralelo (texto não depende dos silêncios); o backend, ao ver que
  // não há bruto, encadeia transcrição + cenas sozinho.
  const handleGerarBrutoInicial = () => {
    if (brutoOcupado()) return;
    dispararBruto(undefined);
    gerarMetadadosClaude.mutate();
  };

  // D-160 — regeração (bruto já existe): por DEFAULT roda só o bruto. Os opt-ins
  // marcados no dropdown ("Também refazer") ligam transcrição/cenas (flags do
  // endpoint) e metadados/desvios (mutations separadas). Desvios alteram o
  // recorte, então rodam ANTES do bruto.
  const handleRegerarBruto = async (opts: RegerarBrutoOpcoes = OPCOES_REGERAR_VAZIAS) => {
    if (brutoOcupado()) return;
    const plano = planejarRegeracaoBruto(opts);
    if (plano.desvios) {
      try {
        await gerarTrechosClaude.mutateAsync();
      } catch {
        // Erro já é notificado pelo hook; segue com o bruto assim mesmo.
      }
    }
    dispararBruto(plano.bruto);
    if (plano.metadados) gerarMetadadosClaude.mutate();
  };

  // Botão/atalho principal: 1ª vez → cadeia completa; regeração → só o bruto.
  const handleGerarBrutoPrincipal = () => {
    if (brutoPronto) void handleRegerarBruto();
    else handleGerarBrutoInicial();
  };

  useEffect(() => {
    resetEditHistory({});
    setPlaybackRate(1);
    setCurrentTime(0);
    setWaveformRefreshKey(0);
    waveformWindowRef.current = null;
    // Reset trecho destravado por default ao trocar de corte (caso o
    // usuario tenha travado e mudado de corte, comeca o proximo destravado).
    setTrechoLocked(false);
  }, [corteId, resetEditHistory]);

  // Quando a geração do bruto termina, traz o corte atualizado (clip_path +
  // transcricao_final re-sincronizada com os desvios removidos).
  // Quando o status vira erro, mostra toast com a mensagem do backend.
  const brutoStatusRaw = statusBruto.data?.status;
  const ultimoStatusRef = useRef<string | undefined>(brutoStatusRaw);
  useEffect(() => {
    const anterior = ultimoStatusRef.current;
    const atual = brutoStatusRaw;
    ultimoStatusRef.current = atual;
    if (!corteId) return;
    const eraProcessando = anterior === 'cortando' || anterior === 'processando';
    if (eraProcessando && atual === 'pronto') {
      qc.invalidateQueries({ queryKey: corteKey(corteId) });
      // Geração completa do bruto (vídeo + cenas) → leva para o pós-produção.
      navigate(postProductionPath(projetoId, corteId, true));
    }
    // Transitou para erro (vindo de qualquer outro estado): notificar.
    if (atual && atual.startsWith('erro:') && anterior !== atual) {
      const msg = atual.replace(/^erro:\s*/, '');
      notifyToast(`Geração de bruto falhou: ${msg}`, { tone: 'error' });
    }
  }, [brutoStatusRaw, corteId, qc, notifyToast, navigate, projetoId]);

  useEffect(() => {
    if (corteId || cortes.length === 0) return;
    const escolhido = cortes.find((item) => item.status === 'aprovado') ?? cortes[0];
    navigate(`/projetos/${projetoId}/cortes/${escolhido.id}`, { replace: true });
  }, [corteId, cortes, navigate, projetoId]);

  function navegarCorte(direcao: -1 | 1) {
    if (!corte || cortes.length === 0) return;
    const index = cortes.findIndex((item) => item.id === corte.id);
    if (index < 0) return;
    const next = (index + direcao + cortes.length) % cortes.length;
    const nextCorte = cortes[next];
    navigate(
      resolveCorteStagePath({
        projetoId,
        corte: nextCorte,
        status: exportStatusQ.data?.cortes.find((status) => status.corte_id === nextCorte.id),
      }),
    );
  }

  function patchDirty(patch: Partial<Corte>) {
    editHistory.set(mergeDirtyPatch(editHistory.getPresent(), patch));
  }

  function setInicioAtual() {
    const seg = playerRef.current?.getCurrentTime() ?? 0;
    patchDirty({ inicio_seg: seg, inicio_hms: segParaHms(seg, true) });
  }

  function setFimAtual() {
    const seg = playerRef.current?.getCurrentTime() ?? 0;
    patchDirty({ fim_seg: seg, fim_hms: segParaHms(seg, true) });
  }

  function salvarMudancas() {
    const pendingDirty = editHistory.getPresent();
    if (!corte || Object.keys(pendingDirty).length === 0) return;
    atualizarCorte.mutate(
      { ...pendingDirty },
      {
        onSuccess: () => {
          editHistory.reset({});
        },
      },
    );
  }

  function onChangeDesvio(idx: number, novoInicio: string, novoFim: string) {
    if (!corte) return;
    const next = applyDesvioChange(
      corte.desvios ?? [],
      editHistory.getPresent(),
      idx,
      novoInicio,
      novoFim,
    );
    if (!next) return;
    editHistory.set(next);
  }

  function onAdicionarDesvio(desvio: Desvio) {
    adicionarDesvio.mutate(desvio);
  }

  function onRemoverDesvio(idx: number) {
    removerDesvio.mutate(idx);
  }

  function onRemoverTrechoSelecionado() {
    const idx = selectedDesvioIdxRef.current;
    if (idx == null) return;
    setSelectedDesvioIdx(null);
    onRemoverDesvio(idx);
  }

  async function onCriarCorteDaSelecao(inicioHms: string, fimHms: string, titulo: string) {
    await api.adicionarDesvio(corteId, {
      inicio_hms: inicioHms,
      fim_hms: fimHms,
      motivo: titulo,
    });
    corteQuery.refetch();
  }

  function onSeekTimeline(seg: number) {
    playerRef.current?.seekTo(seg);
  }

  function onSkip(delta: number) {
    playerRef.current?.step(delta);
  }

  function adicionarTrechoAqui() {
    if (!corteUI) return;
    const time = playerRef.current?.getCurrentTime() ?? corteUI.inicio_seg;
    const start = Math.max(corteUI.inicio_seg, time);
    const end = Math.min(corteUI.fim_seg, start + 5);
    void onCriarCorteDaSelecao(segParaHms(start, true), segParaHms(end, true), 'Trecho manual');
  }

  // F-061: divide o corte em dois no ponteiro do player. Exige salvar antes —
  // o backend usa os limites/desvios persistidos, então edições pendentes
  // seriam ignoradas silenciosamente.
  function onDividirCorteAqui() {
    if (!corteUI || dividirCorte.isPending) return;
    if (isDirty) {
      notifyToast('Salve as alterações antes de dividir o corte.', { tone: 'error' });
      return;
    }
    const ponto = playerRef.current?.getCurrentTime() ?? currentTime;
    if (ponto <= corteUI.inicio_seg + 0.5 || ponto >= corteUI.fim_seg - 0.5) {
      notifyToast('Posicione o ponteiro dentro do corte (longe das bordas) para dividir.', {
        tone: 'error',
      });
      return;
    }
    if (!window.confirm(`Dividir este corte em dois no tempo ${segParaHms(ponto, true)}?`)) {
      return;
    }
    dividirCorte.mutate({ ponto_seg: Number(ponto.toFixed(3)) });
  }

  function onSelectDesvioByTime(time: number) {
    const desvios = corteUI?.desvios ?? [];
    const idx = selectDesvioIdxByTime(desvios, time);
    setSelectedDesvioIdx(idx >= 0 ? idx : null);
  }

  function onChangeSpeed(delta: number) {
    setPlaybackRate((rate) => {
      const next = Math.max(SPEED_MIN, Math.min(SPEED_MAX, rate + delta));
      playerRef.current?.setPlaybackRate(next);
      return next;
    });
  }

  // AUDITORIA-v2 §5 (CP5): atalhos ',' / '.' (Ctrl) para o nudge fino da
  // Sincronia do áudio — mesmo STEP_FINO dos botões -10/+10, mesma lógica
  // de offset já usada pelo AudioSyncControl (clamp em MIN_MS/MAX_MS).
  // Lê a base via editHistory.getPresent() (igual salvarMudancas/patchDirty)
  // em vez de corteUI fechado no closure — os bindings são memoizados e não
  // recalculam a cada tecla, então um valor capturado no closure ficaria
  // desatualizado entre pressionamentos sucessivos.
  function nudgeSincronia(delta: number) {
    if (!corte) return;
    const pendingDirty = editHistory.getPresent();
    const atual = pendingDirty.audio_offset_ms ?? corte.audio_offset_ms ?? 0;
    const next = Math.max(MIN_MS, Math.min(MAX_MS, Math.round(atual + delta)));
    patchDirty({ audio_offset_ms: next });
  }

  function toggleAprovado() {
    if (!corteUI) return;
    const aprovado = ['aprovado', 'editado', 'processado'].includes(corteUI.status);
    const status: Corte['status'] = aprovado ? 'proposto' : 'aprovado';
    atualizarCorte.mutate({ status });
  }

  const deletarCorte = useDeletarCorte(corteId, projetoId);

  function toggleRejeitado() {
    if (!corteUI) return;
    if (
      window.confirm(
        'Tem certeza que deseja excluir permanentemente este corte e todos os seus arquivos?',
      )
    ) {
      deletarCorte.mutate(undefined, {
        onSuccess: () => {
          if (cortes.length > 1) {
            const index = cortes.findIndex((item) => item.id === corteId);
            const next = (index + 1) % cortes.length;
            if (cortes[next].id !== corteId) {
              const nextCorte = cortes[next];
              navigate(
                resolveCorteStagePath({
                  projetoId,
                  corte: nextCorte,
                  status: exportStatusQ.data?.cortes.find(
                    (status) => status.corte_id === nextCorte.id,
                  ),
                }),
              );
              return;
            }
          }
          navigate(`/projetos/${projetoId}`);
        },
      });
    }
  }

  // D-394: bindings vêm do registro central (ids bruto.*) — assim TODA
  // funcionalidade do editor pode ter o atalho reatribuído pelo usuário
  // na página Atalhos (overlay wb-keybindings-v1).
  const bindings: ShortcutBinding[] = useMemo(
    () => [
      shortcutFromRegistry('player.togglePlay', () => playerRef.current?.togglePlay()),
      shortcutFromRegistry('bruto.frameAnterior', () => playerRef.current?.step(-1 / 30)),
      shortcutFromRegistry('bruto.frameProximo', () => playerRef.current?.step(1 / 30)),
      shortcutFromRegistry('bruto.seekBack5s', () => onSkip(-5)),
      shortcutFromRegistry('bruto.seekFwd5s', () => onSkip(5)),
      shortcutFromRegistry('bruto.speedDown', () => onChangeSpeed(-0.25)),
      shortcutFromRegistry('bruto.speedUp', () => onChangeSpeed(0.25)),
      shortcutFromRegistry('bruto.corteAnterior', () => navegarCorte(-1)),
      shortcutFromRegistry('bruto.proximoCorte', () => navegarCorte(1)),
      shortcutFromRegistry('bruto.inAqui', setInicioAtual),
      shortcutFromRegistry('bruto.outAqui', setFimAtual),
      shortcutFromRegistry('bruto.aprovar', toggleAprovado),
      shortcutFromRegistry('bruto.rejeitar', toggleRejeitado),
      shortcutFromRegistry('bruto.fire', () => toggleFire.mutate()),
      shortcutFromRegistry('bruto.leitura', () => corte && toggleLeitura.mutate(corte)),
      shortcutFromRegistry('bruto.travarTrecho', () => setTrechoLocked((v) => !v)),
      shortcutFromRegistry('bruto.modoPonteiro', () => setPointerMode((v) => !v)),
      shortcutFromRegistry('bruto.adicionarTrecho', adicionarTrechoAqui),
      shortcutFromRegistry('bruto.dividirCorte', onDividirCorteAqui),
      shortcutFromRegistry('bruto.removerTrecho', onRemoverTrechoSelecionado),
      shortcutFromRegistry('bruto.smartPlay', () => setSmartPlay((v) => !v)),
      shortcutFromRegistry('bruto.sincroniaNudgeMenos', () => nudgeSincronia(-STEP_FINO)),
      shortcutFromRegistry('bruto.sincroniaNudgeMais', () => nudgeSincronia(STEP_FINO)),
      shortcutFromRegistry('bruto.alternarTempos', () => setTemposAbertos((v) => !v)),
      shortcutFromRegistry('bruto.alternarSincronia', () => setSincroniaAberta((v) => !v)),
      shortcutFromRegistry('bruto.undo', editHistory.undo),
      shortcutFromRegistry('bruto.redo', editHistory.redo),
      shortcutFromRegistry('bruto.salvar', salvarMudancas),
      shortcutFromRegistry('bruto.gerarBruto', () => handleGerarBrutoPrincipal()),
      shortcutFromRegistry('bruto.abrirPasta', () => abrirPasta.mutate(corteId)),
      shortcutFromRegistry('bruto.mostrarAtalhos', () => setShortcutsOpen(true)),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corte, corteId, isDirty],
  );

  useShortcuts(bindings, !!corte);

  if (!projetoId) return <Navigate to="/projetos" replace />;

  if (!corteId && !cortesQuery.isLoading && cortes.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-[var(--wb-text)]">
          Este projeto ainda nao tem cortes
        </h1>
        <p className="max-w-md text-sm">
          Rode a analise da live ou importe cortes para abrir o editor funcional.
        </p>
      </div>
    );
  }

  if (corteQuery.isLoading || cortesQuery.isLoading || !corteUI) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center text-[var(--wb-text-dim)]">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Carregando corte...
      </div>
    );
  }

  if (corteQuery.isError) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 p-8 text-center text-error">
        <h1 className="font-editorial text-3xl font-medium">Nao foi possivel carregar o corte</h1>
        <p className="max-w-xl text-sm">{(corteQuery.error as Error).message}</p>
      </div>
    );
  }

  const videoOriginal = `${VIDEOS_BASE}/videos/${projetoId}/video.mkv`;
  const persistedInicioSeg = corte?.inicio_seg ?? corteUI.inicio_seg;
  const persistedFimSeg = corte?.fim_seg ?? corteUI.fim_seg;
  const waveformWindow = (() => {
    const next = resolveWaveformWindow({
      current: waveformWindowRef.current,
      corteId,
      inicioSeg: persistedInicioSeg,
      fimSeg: persistedFimSeg,
      refreshKey: waveformRefreshKey,
      preloadBeforeSec: WAVEFORM_PRELOAD_BEFORE_SEC,
      preloadAfterSec: WAVEFORM_PRELOAD_AFTER_SEC,
    });
    waveformWindowRef.current = next;
    return next;
  })();
  const waveformVersion = waveformWindow.version;
  const shouldRefreshWaveform = waveformRefreshKey > 0;
  const waveformAudio = appendQueryParams(audioProxyUrl(corteId, shouldRefreshWaveform), {
    v: waveformVersion,
  });
  const waveformPeaks = appendQueryParams(waveformPeaksUrl(corteId, shouldRefreshWaveform), {
    v: waveformVersion,
  });
  const waveformOffsetSec = waveformWindow.startSec;

  // Loading enquanto QUALQUER passo roda: vídeo+cenas (status fica "cortando" até
  // o worker inteiro terminar) OU metadados (mutation paralela do front).
  const brutoBusy =
    brutoStatusAtual === 'processando' ||
    brutoMutationPendenteNoCorteAtual ||
    gerarMetadadosClaude.isPending;
  const metaClaudeStatus: 'pendente' | 'rodando' | 'concluido' | 'erro' =
    gerarMetadadosClaude.isPending
      ? 'rodando'
      : gerarMetadadosClaude.isError
        ? 'erro'
        : gerarMetadadosClaude.isSuccess
          ? 'concluido'
          : 'pendente';
  const durSeg = Math.max(0, corteUI.fim_seg - corteUI.inicio_seg);

  function aplicarIntervaloManual(novoInicioHms: string, novoFimHms: string) {
    const inicioSeg = hmsParaSeg(novoInicioHms);
    const fimSeg = hmsParaSeg(novoFimHms);
    patchDirty({
      inicio_hms: novoInicioHms,
      fim_hms: novoFimHms,
      inicio_seg: inicioSeg,
      fim_seg: fimSeg,
    });
    setIntervaloAberto(false);
  }

  const moreMenuItems: MoreMenuItem[] = [
    {
      icon: RefreshCw,
      label: 'Atualizar pos-producao',
      disabled: true,
      onClick: () => undefined,
    },
    {
      icon: FolderOpen,
      label: 'Abrir pasta',
      kbd: 'Ctrl+O',
      disabled: abrirPasta.isPending,
      onClick: () => abrirPasta.mutate(corteId),
    },
    {
      icon: Keyboard,
      label: 'Atalhos',
      kbd: '?',
      onClick: () => setShortcutsOpen(true),
    },
  ];
  const exportStatuses = exportStatusQ.data?.cortes ?? [];

  const editorModals = (
    <>
      <ShortcutsHelpModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        bindings={bindings}
      />
      <TrechosManualModal
        open={trechosManualOpen}
        onClose={() => setTrechosManualOpen(false)}
        corteId={corteId}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );

  // ── Shell Workbench (Etapa 3): mesma orquestração, re-hospedada ──
  // Painel CORTES retrátil + centro (player 16:9 com cap → transporte →
  // contexto → timeline flex:1) + painel direito retrátil. A lógica acima
  // (hooks, atalhos, dirty, waveform window) é EXATAMENTE a mesma do
  // layout legado — só o container muda.
  if (isWorkbenchEnabled()) {
    return (
      <>
        <WorkbenchEditorLayout
          panelIds={['cuts', 'right']}
          leftPanel={
            <WorkbenchCutsPanel
              projetoId={projetoId}
              cortes={cortes}
              corteAtivoId={corteUI.id}
              exportStatus={exportStatuses}
              getCortePath={(item) =>
                resolveCorteStagePath({
                  projetoId,
                  corte: item,
                  status: exportStatuses.find((status) => status.corte_id === item.id),
                })
              }
              getCurrentTime={() => playerRef.current?.getCurrentTime() ?? currentTime}
            />
          }
          rightPanel={
            <PanelShell id="right" side="right" title="TRECHOS · TRANSCRIÇÃO">
              <div className="min-h-0 flex-1 px-1.5 pb-1.5">
                <RightTabsPanel
                  variant="workbench"
                  corteId={corteUI.id}
                  hintsThumbnail={corteUI.hints_thumbnail}
                  desvios={corteUI.desvios ?? []}
                  selectedDesvioIdx={selectedDesvioIdx}
                  onSeek={onSeekTimeline}
                  onAdicionarDesvio={onAdicionarDesvio}
                  onRemoverDesvio={onRemoverDesvio}
                  onGerarManual={() => setTrechosManualOpen(true)}
                  onGerarTrechosClaude={() => gerarTrechosClaude.mutate()}
                  pendingTrechos={{
                    adicionando: adicionarDesvio.isPending,
                    removendo: removerDesvio.isPending,
                    claude: gerarTrechosClaude.isPending,
                  }}
                  transcricao={corteUI.transcricao_corte}
                  currentTime={currentTime}
                  onAtualizarTranscricao={() => sincTrans.mutate()}
                  transcricaoAtualizando={sincTrans.isPending}
                />
              </div>
            </PanelShell>
          }
        >
          {/* Toolbar do Bruto (AUDITORIA-v2 §2/§3, CP2/CP3): veredito em
              ícones (reaproveita StatusToggleRow, só muda a apresentação) +
              regerar/pasta/tempos/sincronia/info + chip do vídeo original +
              pílula Salvar flutuante (último filho flex — reserva a própria
              largura; NÃO é position:absolute, nada desliza por baixo). */}
          <div className="flex flex-none items-center gap-1.5">
            <StatusToggleRow
              corte={corteUI}
              onAprovar={toggleAprovado}
              onRejeitar={toggleRejeitado}
              onToggleFire={() => toggleFire.mutate()}
              onToggleLeitura={() => toggleLeitura.mutate(corteUI)}
              onUpdateLeitura={(patch) =>
                atualizarCorte.mutate(patch, {
                  onSuccess: () => qc.invalidateQueries({ queryKey: ['metadado', corteId] }),
                })
              }
              pendingFlags={{
                aprovando: atualizarCorte.isPending,
                rejeitando: atualizarCorte.isPending,
                fire: toggleFire.isPending,
                leitura: toggleLeitura.isPending,
              }}
              iconOnly
            />

            <div className="h-6 w-px flex-none bg-[var(--wb-border)]" aria-hidden />

            {/* Cluster de ferramentas do corte: UM fundo/borda para o grupo
                inteiro (cada botão era uma caixa com borda própria, e a do
                "regerar" ainda destoava por causa do wrapper do dropdown).
                Cor fica só no glifo — identidade sem o peso de um chip cheio. */}
            <div className="inline-flex flex-none items-center gap-0.5 rounded-[9px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-[3px]">
              <div className="relative">
                <Tooltip
                  label={brutoPronto ? 'Regerar bruto (Ctrl+G)' : 'Gerar bruto (Ctrl+G)'}
                  side="bottom"
                >
                  <button
                    type="button"
                    aria-label={brutoPronto ? 'Regerar bruto' : 'Gerar bruto'}
                    className={cn(FERRAMENTA_CLASS, 'text-[var(--wb-accent)]')}
                    onClick={() => {
                      // brutoPronto: abre o dropdown p/ escolher o que também
                      // refazer (mesmo handleRegerarBruto de sempre). 1ª geração
                      // não tem opt-ins — dispara direto (mesmo Ctrl+G/botão de
                      // sempre): handleGerarBrutoPrincipal.
                      if (brutoPronto) setBrutoDropdownOpen((v) => !v);
                      else handleGerarBrutoPrincipal();
                    }}
                    disabled={brutoBusy}
                  >
                    {brutoBusy ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw size={15} aria-hidden />
                    )}
                  </button>
                </Tooltip>
                {brutoPronto && (
                  <BrutoStepsDropdown
                    corteId={corteId}
                    ativo={brutoBusy}
                    metadadosStatus={metaClaudeStatus}
                    variant="outline"
                    brutoPronto={brutoPronto}
                    onRegerar={brutoBusy ? undefined : handleRegerarBruto}
                    open={brutoDropdownOpen}
                    onOpenChange={setBrutoDropdownOpen}
                    hideTrigger
                  />
                )}
              </div>

              <Tooltip label="Abrir pasta (Ctrl+O)" side="bottom">
                <button
                  type="button"
                  aria-label="Abrir pasta do corte"
                  className={cn(FERRAMENTA_CLASS, 'text-[var(--wb-warn)]')}
                  onClick={() => abrirPasta.mutate(corteId)}
                  disabled={abrirPasta.isPending}
                >
                  <FolderOpen size={14} aria-hidden />
                </button>
              </Tooltip>

              {/* D-408: a tecla entra no rotulo (como "Regerar bruto (Ctrl+G)"
                  e "Abrir pasta (Ctrl+O)" ao lado) — atalho que so vive no
                  registro nao e descoberto por ninguem. */}
              <Tooltip label="Tempos do corte (T)" side="bottom">
                <button
                  type="button"
                  aria-label="Alternar tempos do corte"
                  aria-pressed={temposAbertos}
                  className={cn(
                    FERRAMENTA_CLASS,
                    temposAbertos
                      ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                      : 'text-[var(--wb-info)]',
                  )}
                  onClick={() => setTemposAbertos((v) => !v)}
                >
                  <Clock size={14} aria-hidden />
                </button>
              </Tooltip>

              <Tooltip label="Sincronia do áudio (H)" side="bottom">
                <button
                  type="button"
                  aria-label="Alternar sincronia do áudio"
                  aria-pressed={sincroniaAberta}
                  className={cn(
                    FERRAMENTA_CLASS,
                    sincroniaAberta
                      ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                      : 'text-[var(--wb-violet)]',
                  )}
                  onClick={() => setSincroniaAberta((v) => !v)}
                >
                  <Headphones size={14} aria-hidden />
                </button>
              </Tooltip>
            </div>

            {/* ℹ️ — SÓ tooltip via atributo title (AUDITORIA-v2 §2): sem
                onClick, sem modal. O atalho continua na página Atalhos. */}
            <span
              title="Aprovar A · Rejeitar R · Fire F · Tempos T · Sincronia H · In/Out [ ] · Navegar ←→ 5s · Desfazer Ctrl+Z"
              className="flex aspect-square min-w-[24px] flex-[0_1_34px] cursor-help items-center justify-center text-[var(--wb-text-dim)]"
            >
              <Info size={14} aria-hidden />
            </span>

            <span className="min-w-0 flex-[0_1_auto] overflow-hidden whitespace-nowrap text-ellipsis rounded-[5px] bg-[var(--wb-bg-inset)] px-2 py-0.5 font-code text-[8.5px] font-bold uppercase text-[var(--wb-text-mute)]">
              Vídeo original · 4K
            </span>
            <span className="min-w-0 flex-[0_1_auto] overflow-hidden whitespace-nowrap text-ellipsis font-code text-[10px] font-semibold text-[var(--wb-text-dim)]">
              corte de {segParaMmSs(durSeg, true)}
            </span>

            <div className="min-w-2 flex-1" />

            {/* D-407: o Salvar era permanente e so ficava `disabled` quando
                limpo — ocupava a ponta da toolbar sem dizer nada. Agora so
                existe enquanto ha o que salvar (ou enquanto salva, para o
                clique nao sumir sob o cursor) e usa a cor de alerta, virando
                o aviso de "corte sujo" em vez de mais um botao morto. Sem
                salto de layout: quem cede o espaco e o espacador flex-1 ao
                lado, entao nada da toolbar se desloca. */}
            {(isDirty || atualizarCorte.isPending) && (
              <Tooltip label="Salvar (Ctrl+S)" side="top">
                <button
                  type="button"
                  onClick={salvarMudancas}
                  disabled={atualizarCorte.isPending}
                  className="flex flex-none items-center gap-1.5 rounded-lg border border-[var(--wb-warn)] bg-[var(--wb-warn-soft)] px-[11px] py-[7px] shadow-[shadow:var(--wb-shadow)] disabled:pointer-events-none disabled:opacity-60"
                >
                  {atualizarCorte.isPending ? (
                    <Loader2
                      size={11}
                      className="animate-spin text-[var(--wb-warn-ink)]"
                      aria-hidden
                    />
                  ) : (
                    <span className="h-[7px] w-[7px] rounded-full bg-[var(--wb-warn)]" aria-hidden />
                  )}
                  <span className="text-[10.5px] font-bold text-[var(--wb-warn-ink)]">Salvar</span>
                  <span className="font-code text-[9px] font-semibold text-[var(--wb-warn-ink)] opacity-70">
                    Ctrl+S
                  </span>
                </button>
              </Tooltip>
            )}
          </div>

          <PlayerCap>
            <PlayerPanel
              ref={playerRef}
              variant="overlay"
              src={videoOriginal}
              inicioSeg={corteUI.inicio_seg}
              fimSeg={corteUI.fim_seg}
              desvios={corteUI.desvios ?? []}
              playbackRate={playbackRate}
              smartPlay={smartPlay}
              onTimeUpdate={setCurrentTime}
              audioPreviewSrc={waveformAudio}
              audioPreviewStartSec={waveformOffsetSec}
              audioOffsetMs={corteUI.audio_offset_ms ?? 0}
              onAudioOffsetChange={(ms) => patchDirty({ audio_offset_ms: ms })}
            />
          </PlayerCap>

          {/* Sincronia (AUDITORIA-v2 §5, CP5): oculta por padrao, alterna
              pelo icone 🎧 da toolbar. Fica entre o video e o painel de
              Tempos — nunca dentro do PlayerCap (senao disputaria altura
              com o video no teto de 44vh). */}
          {sincroniaAberta && (
            <AudioSyncControl
              variant="workbench"
              offsetMs={corteUI.audio_offset_ms ?? 0}
              onChange={(ms) => patchDirty({ audio_offset_ms: ms })}
              onClose={() => setSincroniaAberta(false)}
            />
          )}

          {/* Tempos (AUDITORIA-v2 §6, CP6): oculto por padrao, alterna pelo
              icone 🕑 da toolbar. Hospeda titulo/trechos/Intervalo — o
              bloco que antes ficava sempre visivel solto no centro. */}
          {temposAbertos && (
            <BrutoContextStrip
              variant="workbench"
              previous={
                previousCut ? { numero: previousCut.numero, hms: previousCut.fim_hms } : null
              }
              next={nextCut ? { numero: nextCut.numero, hms: nextCut.inicio_hms } : null}
              inicioHms={corteUI.inicio_hms}
              fimHms={corteUI.fim_hms}
              inicioSeg={hmsParaSeg(corteUI.inicio_hms)}
              currentTime={currentTime}
              durSeg={durSeg}
              liquidoSeg={liquidoSeg}
              intervaloAberto={intervaloAberto}
              onToggleIntervalo={() => setIntervaloAberto((v) => !v)}
              onAplicarIntervalo={aplicarIntervaloManual}
              titulo={corteUI.titulo_proposto}
              onChangeTitulo={(titulo) => patchDirty({ titulo_proposto: titulo })}
              trechosCount={(corteUI.desvios ?? []).length}
            />
          )}

          {/* Os 200px do DE-PARA §3 (quanto mais alto o painel, mais legível a
              onda) eram um `min-height`, e min-height RÍGIDO nao encolhe: com
              Tempos e/ou Sincronia abertos numa janela baixa a soma dos irmaos
              estourava a coluna e a onda vazava por baixo do `overflow-hidden`
              — media 77px fora em 1600x720 (D-411).
              Vira `flex: 1 1 200px`: 200px continua sendo a altura PREFERIDA e
              a onda ainda cresce quando sobra espaco, mas agora e um basis, que
              o flex pode encolher quando falta. O piso de 110px (cabecalho da
              timeline + onda ainda legivel) e seguro agora que o PlayerCap
              tambem encolhe (D-411): sempre ha quem ceda antes de estourar. */}
          <div className="min-h-[110px] shrink grow basis-[200px]">
            <TimelinePanel
              variant="workbench"
              audioSrc={waveformAudio}
              waveformPeaksSrc={waveformPeaks}
              audioOffsetSec={waveformOffsetSec}
              inicioSeg={corteUI.inicio_seg}
              fimSeg={corteUI.fim_seg}
              desvios={corteUI.desvios ?? []}
              currentTime={currentTime}
              playbackRate={playbackRate}
              playerRef={playerRef}
              onSeek={onSeekTimeline}
              onSkip={onSkip}
              onChangeSpeed={onChangeSpeed}
              onSetInicioAqui={setInicioAtual}
              onSetFimAqui={setFimAtual}
              onAtualizarAudioTimeline={() => setWaveformRefreshKey((k) => k + 1)}
              locked={trechoLocked}
              onToggleLocked={() => setTrechoLocked((v) => !v)}
              pointer={pointerMode}
              onTogglePointer={() => setPointerMode((v) => !v)}
              smartPlay={smartPlay}
              onToggleSmartPlay={() => setSmartPlay((v) => !v)}
              onSelectDesvio={onSelectDesvioByTime}
              onAdicionarTrechoAqui={adicionarTrechoAqui}
              onChangeDesvio={onChangeDesvio}
              onCriarCorteDaSelecao={onCriarCorteDaSelecao}
              onDividirAqui={onDividirCorteAqui}
              dividindo={dividirCorte.isPending}
              onGerarBruto={handleGerarBrutoPrincipal}
              brutoPronto={brutoPronto}
              brutoStatus={brutoStatusAtual}
            />
          </div>
        </WorkbenchEditorLayout>
        {editorModals}
      </>
    );
  }

  return (
    <>
      <UnifiedSidebar
        projetoId={projetoId}
        cortes={cortes}
        corteAtivoId={corteUI.id}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        activePhase="editor"
        getCortePath={(item) =>
          resolveCorteStagePath({
            projetoId,
            corte: item,
            status: exportStatuses.find((status) => status.corte_id === item.id),
          })
        }
        onOpenSettings={() => setSettingsOpen(true)}
        getCurrentTime={() => playerRef.current?.getCurrentTime() ?? currentTime}
      />

      <div className="ml-[132px] flex h-screen flex-col overflow-hidden bg-[var(--wb-bg)]">
        <CommonTopBar
          projeto={projeto.data}
          corte={corteUI}
          dirty={isDirty}
          statusToggles={
            <StatusToggleRow
              corte={corteUI}
              onAprovar={toggleAprovado}
              onRejeitar={toggleRejeitado}
              onToggleFire={() => toggleFire.mutate()}
              onToggleLeitura={() => toggleLeitura.mutate(corteUI)}
              onUpdateLeitura={(patch) =>
                atualizarCorte.mutate(patch, {
                  // Backend reaplica o prefixo "Leitura - ... | " no titulo do
                  // YouTube quando autor/parte mudam; invalida o metadado p/ a
                  // UI refletir na hora.
                  onSuccess: () => qc.invalidateQueries({ queryKey: ['metadado', corteId] }),
                })
              }
              pendingFlags={{
                aprovando: atualizarCorte.isPending,
                rejeitando: atualizarCorte.isPending,
                fire: toggleFire.isPending,
                leitura: toggleLeitura.isPending,
              }}
            />
          }
          secondaryAction={
            <div className="flex items-center">
              <Tooltip
                label={brutoPronto ? 'Regerar bruto (Ctrl+G)' : 'Gerar bruto (Ctrl+G)'}
                side="bottom"
              >
                <Button
                  variant={brutoPronto ? 'outline' : 'default'}
                  size="sm"
                  className="rounded-r-none"
                  onClick={handleGerarBrutoPrincipal}
                  disabled={brutoBusy}
                >
                  {brutoBusy ? <Loader2 className="animate-spin" /> : <Scissors />}
                  {brutoPronto ? 'Regerar bruto' : 'Gerar bruto'}
                </Button>
              </Tooltip>
              <BrutoStepsDropdown
                corteId={corteId}
                ativo={brutoBusy}
                metadadosStatus={metaClaudeStatus}
                variant={brutoPronto ? 'outline' : 'default'}
                brutoPronto={brutoPronto}
                onRegerar={brutoBusy ? undefined : handleRegerarBruto}
              />
            </div>
          }
          primaryAction={
            <Tooltip label="Salvar (Ctrl+S)" side="bottom">
              <IconButton
                aria-label="Salvar"
                title="Salvar (Ctrl+S)"
                variant={isDirty ? 'accent' : 'outline'}
                onClick={salvarMudancas}
                disabled={!isDirty || atualizarCorte.isPending}
              >
                {atualizarCorte.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              </IconButton>
            </Tooltip>
          }
          moreMenuItems={moreMenuItems}
        />

        <BrutoContextStrip
          previous={previousCut ? { numero: previousCut.numero, hms: previousCut.fim_hms } : null}
          next={nextCut ? { numero: nextCut.numero, hms: nextCut.inicio_hms } : null}
          inicioHms={corteUI.inicio_hms}
          fimHms={corteUI.fim_hms}
          inicioSeg={hmsParaSeg(corteUI.inicio_hms)}
          currentTime={currentTime}
          durSeg={durSeg}
          liquidoSeg={liquidoSeg}
          intervaloAberto={intervaloAberto}
          onToggleIntervalo={() => setIntervaloAberto((v) => !v)}
          onAplicarIntervalo={aplicarIntervaloManual}
        />

        <div className="min-h-0 flex-1">
          <EditorFase1
            videoSrc={videoOriginal}
            audioSrc={waveformAudio}
            waveformPeaksSrc={waveformPeaks}
            corte={corteUI}
            audioOffsetSec={waveformOffsetSec}
            currentTime={currentTime}
            playbackRate={playbackRate}
            brutoStatus={statusBruto.data}
            brutoPronto={brutoPronto}
            playerRef={playerRef}
            audioPreviewSrc={waveformAudio}
            audioPreviewStartSec={waveformOffsetSec}
            audioOffsetMs={corteUI.audio_offset_ms ?? 0}
            onAudioOffsetChange={(ms) => patchDirty({ audio_offset_ms: ms })}
            onTimeUpdate={setCurrentTime}
            onSeek={onSeekTimeline}
            onSkip={onSkip}
            onChangeSpeed={onChangeSpeed}
            onSetInicioAqui={setInicioAtual}
            onSetFimAqui={setFimAtual}
            onAtualizarAudioTimeline={() => setWaveformRefreshKey((k) => k + 1)}
            trechoLocked={trechoLocked}
            onToggleTrechoLocked={() => setTrechoLocked((v) => !v)}
            pointerMode={pointerMode}
            onTogglePointerMode={() => setPointerMode((v) => !v)}
            smartPlay={smartPlay}
            onToggleSmartPlay={() => setSmartPlay((v) => !v)}
            selectedDesvioIdx={selectedDesvioIdx}
            onSelectDesvioByTime={onSelectDesvioByTime}
            onAdicionarTrechoAqui={adicionarTrechoAqui}
            onGerarBruto={handleGerarBrutoPrincipal}
            onAtualizarTranscricao={() => sincTrans.mutate()}
            onChangeDesvio={onChangeDesvio}
            onAdicionarDesvio={onAdicionarDesvio}
            onRemoverDesvio={onRemoverDesvio}
            onCriarCorteDaSelecao={onCriarCorteDaSelecao}
            onDividirCorteAqui={onDividirCorteAqui}
            dividindoCorte={dividirCorte.isPending}
            onGerarManual={() => setTrechosManualOpen(true)}
            onGerarTrechosClaude={() => gerarTrechosClaude.mutate()}
            pending={{
              bruto: brutoMutationPendenteNoCorteAtual,
              transcricao: sincTrans.isPending,
              adicionando: adicionarDesvio.isPending,
              removendo: removerDesvio.isPending,
              claude: gerarTrechosClaude.isPending,
            }}
          />
        </div>
      </div>

      {editorModals}
    </>
  );
}
