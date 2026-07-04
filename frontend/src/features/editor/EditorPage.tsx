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
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { FolderOpen, Keyboard, Loader2, RefreshCw, Save, Scissors } from 'lucide-react';
import type { Corte, Desvio } from '@/types/models';
import { EditorFase1 } from './fase1/EditorFase1';
import type { PlayerHandle } from './fase1/PlayerPanel';
import { TrechosManualModal } from './fase1/TrechosManualModal';
import { BrutoContextStrip } from './fase1/BrutoContextStrip';
import { BrutoStepsDropdown } from './BrutoStepsDropdown';
import {
  OPCOES_REGERAR_VAZIAS,
  planejarRegeracaoBruto,
  type RegerarBrutoOpcoes,
} from './regerarBrutoPlan';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { useShortcuts, type ShortcutBinding } from './shortcuts';
import { calcularDuracaoLiquida, hmsParaSeg, segParaHms } from './timeUtils';
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
  const [dirty, setDirty] = useState<Partial<Corte>>({});
  const dirtyRef = useRef<Partial<Corte>>({});
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
    dirtyRef.current = {};
    setDirty({});
    setPlaybackRate(1);
    setCurrentTime(0);
    setWaveformRefreshKey(0);
    waveformWindowRef.current = null;
    // Reset trecho destravado por default ao trocar de corte (caso o
    // usuario tenha travado e mudado de corte, comeca o proximo destravado).
    setTrechoLocked(false);
  }, [corteId]);

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
    const next = mergeDirtyPatch(dirtyRef.current, patch);
    dirtyRef.current = next;
    setDirty(next);
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
    const pendingDirty = dirtyRef.current;
    if (!corte || Object.keys(pendingDirty).length === 0) return;
    atualizarCorte.mutate(
      { ...pendingDirty },
      {
        onSuccess: () => {
          dirtyRef.current = {};
          setDirty({});
        },
      },
    );
  }

  function onChangeDesvio(idx: number, novoInicio: string, novoFim: string) {
    if (!corte) return;
    const next = applyDesvioChange(corte.desvios ?? [], dirtyRef.current, idx, novoInicio, novoFim);
    if (!next) return;
    dirtyRef.current = next;
    setDirty(next);
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

  const bindings: ShortcutBinding[] = useMemo(
    () => [
      {
        key: ' ',
        group: 'player',
        description: 'Play/pause',
        action: () => playerRef.current?.togglePlay(),
      },
      {
        key: ',',
        group: 'player',
        description: 'Frame anterior',
        action: () => playerRef.current?.step(-1 / 30),
      },
      {
        key: '.',
        group: 'player',
        description: 'Frame proximo',
        action: () => playerRef.current?.step(1 / 30),
      },
      { key: 'arrowleft', group: 'player', description: 'Retroceder 5s', action: () => onSkip(-5) },
      { key: 'arrowright', group: 'player', description: 'Avancar 5s', action: () => onSkip(5) },
      {
        key: 'j',
        mod: 'ctrl',
        group: 'player',
        description: 'Velocidade -0.25',
        action: () => onChangeSpeed(-0.25),
      },
      {
        key: 'k',
        mod: 'ctrl',
        group: 'player',
        description: 'Velocidade +0.25',
        action: () => onChangeSpeed(0.25),
      },
      {
        key: 'j',
        group: 'navegacao',
        description: 'Corte anterior',
        action: () => navegarCorte(-1),
      },
      { key: 'k', group: 'navegacao', description: 'Proximo corte', action: () => navegarCorte(1) },
      {
        key: '[',
        group: 'edicao',
        description: 'Definir inicio no tempo atual',
        action: setInicioAtual,
      },
      { key: ']', group: 'edicao', description: 'Definir fim no tempo atual', action: setFimAtual },
      { key: 'a', group: 'edicao', description: 'Alternar aprovado', action: toggleAprovado },
      { key: 'r', group: 'edicao', description: 'Alternar rejeitado', action: toggleRejeitado },
      { key: 'f', group: 'edicao', description: 'Toggle fire', action: () => toggleFire.mutate() },
      {
        key: 'l',
        group: 'edicao',
        description: 'Toggle leitura',
        action: () => corte && toggleLeitura.mutate(corte),
      },
      {
        key: 'l',
        mod: 'ctrl',
        group: 'edicao',
        description: 'Travar/destravar trecho',
        action: () => setTrechoLocked((v) => !v),
      },
      {
        key: 'p',
        mod: 'ctrl',
        group: 'edicao',
        description: 'Ativar/desativar modo ponteiro',
        action: () => setPointerMode((v) => !v),
      },
      {
        key: 't',
        mod: 'ctrl+alt',
        group: 'edicao',
        description: 'Adicionar trecho no cursor',
        action: adicionarTrechoAqui,
      },
      {
        key: 'd',
        group: 'edicao',
        description: 'Dividir corte no ponteiro',
        action: onDividirCorteAqui,
      },
      {
        key: 'Delete',
        mod: 'ctrl',
        group: 'edicao',
        description: 'Remover trecho selecionado (Ctrl+click no trecho)',
        action: onRemoverTrechoSelecionado,
      },
      {
        key: 'b',
        mod: 'ctrl',
        group: 'edicao',
        description: 'Reproducao sem cortes (smart play)',
        action: () => setSmartPlay((v) => !v),
      },
      {
        key: 's',
        mod: 'any',
        group: 'global',
        description: 'Salvar mudancas',
        action: salvarMudancas,
      },
      {
        key: 'g',
        mod: 'any',
        group: 'global',
        description: 'Gerar video bruto',
        action: () => handleGerarBrutoPrincipal(),
      },
      {
        key: 'o',
        mod: 'any',
        group: 'global',
        description: 'Abrir pasta',
        action: () => abrirPasta.mutate(corteId),
      },
      {
        key: '?',
        mod: 'shift',
        group: 'global',
        description: 'Mostrar atalhos',
        action: () => setShortcutsOpen(true),
      },
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
}
