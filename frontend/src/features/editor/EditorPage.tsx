import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAbrirPasta, useExportStatus, useProjeto } from '@/hooks/useProjetoDetalhe';
import { useVelocidadePlayerPadrao } from '@/hooks/useVelocidadePlayerPadrao';
import { useContextoCorte } from '@/hooks/useContextoCorte';
import {
  corteKey,
  useAdicionarDesvio,
  useAtualizarCorte,
  useCorte,
  useCortesProjeto,
  useDeletarCorte,
  useDividirCorte,
  useJuntarCortes,
  useGerarBruto,
  useGerarMetadadosClaude,
  useGerarTrechosClaude,
  useRemoverDesvio,
  useSincronizarTranscricao,
  useStatusBruto,
  useStatusMetadadosClaude,
  useToggleFire,
  useToggleLeitura,
  useTrechosClaudeEmAndamento,
} from '@/hooks/useEditor';
import { api, audioProxyUrl, waveformPeaksUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
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
import { confirmacaoRegerarBruto, confirmacaoRegerarTrechos } from './regeracaoConfirmacao';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { useShortcuts, type ShortcutBinding } from './shortcuts';
import { shortcutFromRegistry } from './shortcutsRegistry';
import { useEditHistory } from './useEditHistory';
import { calcularDuracaoLiquida, hmsParaSeg, segParaHms, segParaMmSs } from './timeUtils';
import { selectDesvioIdxByTime } from './fase1/desvioUtils';
import { UnifiedSidebar } from './UnifiedSidebar';
import { CommonTopBar, StatusToggleRow, type MoreMenuItem } from './CommonTopBar';
import { SettingsModal } from '@/components/layout/SettingsModal';
import { AvaliacaoCorteModal } from './avaliacao/AvaliacaoCorteModal';
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
// D-575: os dois polos da alternancia de velocidade. 1x e onde se confere o
// resultado; a "de trabalho" e a ultima velocidade != 1x que esteve em uso.
const VELOCIDADE_NORMAL = 1;
// Semente para quem nunca saiu do 1x: o pedido nasceu de precisar ouvir
// DEVAGAR para acertar a borda do corte, entao o primeiro toque desacelera.
const VELOCIDADE_TRABALHO_INICIAL = 0.75;

function appendQueryParams(url: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${search}`;
}

// BotÃƒÂ£o dentro do cluster de ferramentas do Bruto: sem borda e sem fundo
// prÃƒÂ³prios (quem tem ÃƒÂ© o cluster), tamanho igual ao dos vizinhos. A cor do
// glifo vem de fora, por ferramenta.
const FERRAMENTA_CLASS =
  'flex aspect-square min-w-[24px] flex-[0_1_34px] items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--wb-bg-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:pointer-events-none disabled:opacity-40';

// D-410: par rÃƒÂ³tulo/valor da faixa acima do vÃƒÂ­deo. RÃƒÂ³tulo miÃƒÂºdo em caixa alta
// e valor em tabular-nums, para os nÃƒÂºmeros nÃƒÂ£o danÃƒÂ§arem enquanto o player anda.
const TOM_FAIXA_VIDEO = {
  padrao: 'text-[var(--wb-text)]',
  ok: 'text-[var(--wb-ok)]',
  accent: 'text-[var(--wb-accent)]',
} as const;

function CampoFaixaVideo({
  rotulo,
  valor,
  tom = 'padrao',
  titulo,
}: {
  rotulo: string;
  valor: string;
  tom?: keyof typeof TOM_FAIXA_VIDEO;
  titulo?: string;
}) {
  return (
    <span className="flex flex-none items-baseline gap-1.5" title={titulo}>
      <span className="font-code text-[8.5px] font-bold uppercase tracking-[0.12em] text-[var(--wb-text-dim)]">
        {rotulo}
      </span>
      <span
        className={cn('font-code text-[11px] font-semibold', TOM_FAIXA_VIDEO[tom])}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {valor}
      </span>
    </span>
  );
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
  // D-450: velocidade padrao vinda de Ajustes (app_settings).
  const velocidadePadrao = useVelocidadePlayerPadrao();
  // D-451: respiro configuravel antes/depois do corte Ã¢â‚¬â€ define a janela de onda
  // carregada e, com ela, o offset que casa o tempo do audio com o do video.
  const contextoCorte = useContextoCorte();
  const [playbackRate, setPlaybackRate] = useState(velocidadePadrao);
  // D-575: a ultima velocidade != 1x que esteve em uso. Afinar a borda de um
  // corte pede ouvir devagar e conferir pede 1x, e a ida e volta e sempre entre
  // esses dois valores Ã¢â‚¬â€ guardar o "devagar" evita refazer o caminho no Ctrl+J/K
  // a cada troca. Ref, e nao state: e memoria do gatilho, nao coisa que a tela
  // desenha, e os bindings de atalho sao memoizados (state ficaria stale).
  const velocidadeTrabalhoRef = useRef(VELOCIDADE_TRABALHO_INICIAL);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trechosManualOpen, setTrechosManualOpen] = useState(false);
  // D-419: avaliaÃƒÂ§ÃƒÂ£o da qualidade do corte, perguntada uma ÃƒÂºnica vez Ã¢â‚¬â€ no
  // clique que dispara a 1Ã‚Âª geraÃƒÂ§ÃƒÂ£o do bruto.
  const [avaliacaoOpen, setAvaliacaoOpen] = useState(false);
  const [intervaloAberto, setIntervaloAberto] = useState(false);
  // AUDITORIA-v2 Ã‚Â§2/Ã‚Â§5/Ã‚Â§6 (CP2): toggles da toolbar do Workbench. ComeÃƒÂ§am
  // FECHADOS Ã¢â‚¬â€ Sincronia/Tempos ficam ocultos por padrÃƒÂ£o (sÃƒÂ³ o estado do
  // ÃƒÂ­cone muda nesta etapa; a prÃƒÂ³xima liga a visibilidade de
  // BrutoContextStrip/AudioSyncControl a partir destes mesmos booleans).
  const [temposAbertos, setTemposAbertos] = useState(false);
  const [sincroniaAberta, setSincroniaAberta] = useState(false);
  // Painel "passos do bruto" (BrutoStepsDropdown), agora aberto pelo ÃƒÂ­cone
  // Ã¢Å¸Â³ da toolbar (controlado por fora Ã¢â‚¬â€ ver CP2).
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
  // D-361: histÃƒÂ³rico das ediÃƒÂ§ÃƒÂµes locais (dirty) com Ctrl+Z / Ctrl+Y.
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

  // Contexto do BrutoContextStrip Ã¢â‚¬â€ corte anterior aprovado, proximo corte,
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
  // exportStatus sÃƒÂ³ lista APROVADO/EDITADO/PROCESSADO. is_pos_producao do
  // prÃƒÂ³prio corte cobre cortes em outros status que jÃƒÂ¡ tem video.mp4 no disco.
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
  const juntarCortes = useJuntarCortes(corteId, projetoId);
  const abrirPasta = useAbrirPasta();
  const brutoMutationPendenteNoCorteAtual = gerarBruto.isPending && gerandoBrutoCorteId === corteId;
  // D-420 Ã¢â‚¬â€ as geraÃƒÂ§ÃƒÂµes via Claude sÃƒÂ£o longas (dezenas de segundos) e o editor
  // NÃƒÆ’O remonta ao trocar de corte: lidas direto do `isPending` da mutaÃƒÂ§ÃƒÂ£o, elas
  // desabilitavam o botÃƒÂ£o do corte novo por causa da execuÃƒÂ§ÃƒÂ£o do anterior. Estes
  // dois leem o estado no cache, chaveado pelo corte que pediu.
  const metaClaudeStatus = useStatusMetadadosClaude(corteId);
  const trechosClaudePendente = useTrechosClaudeEmAndamento(corteId);

  const confirmacao = useConfirmacao();

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

  // F-038 â€” 1Âª geraÃ§Ã£o (corte sem bruto): cadeia completa. Dispara metadados via
  // Claude em paralelo (texto nÃ£o depende dos silÃªncios); o backend, ao ver que
  // nÃ£o hÃ¡ bruto, encadeia transcriÃ§Ã£o + cenas sozinho.
  const handleGerarBrutoInicial = () => {
    if (brutoOcupado()) return;
    dispararBruto(undefined);
    gerarMetadadosClaude.mutate('claude');
    // D-419: pergunta a qualidade AGORA, nÃ£o quando o bruto ficar pronto â€” Ã©
    // neste clique que o editor acabou de ver e ajustar o corte. A geraÃ§Ã£o jÃ¡
    // saiu acima e corre em segundo plano; o modal nÃ£o a bloqueia.
    setAvaliacaoOpen(true);
  };

  // D-160 â€” regeraÃ§Ã£o (bruto jÃ¡ existe): por DEFAULT roda sÃ³ o bruto. Os opt-ins
  // marcados no dropdown ("TambÃ©m refazer") ligam transcriÃ§Ã£o/cenas (flags do
  // endpoint) e metadados/desvios (mutations separadas). Desvios alteram o
  // recorte, entÃ£o rodam ANTES do bruto.
  const executarRegeracaoBruto = async (opts: RegerarBrutoOpcoes) => {
    const plano = planejarRegeracaoBruto(opts);
    if (plano.desvios) {
      try {
        await gerarTrechosClaude.mutateAsync('claude');
      } catch {
        // Erro jÃ¡ Ã© notificado pelo hook; segue com o bruto assim mesmo.
      }
    }
    dispararBruto(plano.bruto);
    if (plano.metadados) gerarMetadadosClaude.mutate('claude');
  };

  // D-428 Ã¢â‚¬â€ com bruto jÃƒÂ¡ na mÃƒÂ£o, regerar substitui o vÃƒÂ­deo atual: passa pela
  // confirmaÃƒÂ§ÃƒÂ£o antes de sair. Cobre o Ctrl+G, o botÃƒÂ£o principal e o "Regerar
  // bruto" do dropdown, que caÃƒÂ­am todos aqui.
  const handleRegerarBruto = (opts: RegerarBrutoOpcoes = OPCOES_REGERAR_VAZIAS) => {
    if (brutoOcupado()) return;
    confirmacao.executarOuPedir(confirmacaoRegerarBruto(brutoPronto, opts), () =>
      void executarRegeracaoBruto(opts),
    );
  };

  // BotÃƒÂ£o/atalho principal: 1Ã‚Âª vez Ã¢â€ â€™ cadeia completa; regeraÃƒÂ§ÃƒÂ£o Ã¢â€ â€™ sÃƒÂ³ o bruto.
  const handleGerarBrutoPrincipal = () => {
    if (brutoPronto) handleRegerarBruto();
    else handleGerarBrutoInicial();
  };

  // D-428 Ã¢â‚¬â€ analisar trechos de novo acrescenta ÃƒÂ  lista jÃƒÂ¡ revisada e custa
  // Claude: com trechos marcados, confirma antes.
  const handleGerarTrechosIA = (provider: 'claude' | 'gemini') => {
    confirmacao.executarOuPedir(confirmacaoRegerarTrechos(corteUI?.desvios?.length ?? 0), () =>
      gerarTrechosClaude.mutate(provider),
    );
  };

  useEffect(() => {
    resetEditHistory({});
    setCurrentTime(0);
    setWaveformRefreshKey(0);
    waveformWindowRef.current = null;
    // Reset trecho destravado por default ao trocar de corte (caso o
    // usuario tenha travado e mudado de corte, comeca o proximo destravado).
    setTrechoLocked(false);
  }, [corteId, resetEditHistory]);

  // D-450: o player abre na velocidade configurada em Ajustes. Efeito
  // proprio (e nao o reset por troca de corte acima) porque tambem dispara
  // quando a preferencia chega da API ou muda no painel Ã¢â‚¬â€ sem arrastar
  // junto o reset do historico de edicao.
  useEffect(() => {
    setPlaybackRate(velocidadePadrao);
  }, [corteId, velocidadePadrao]);

  // D-575: a "velocidade de trabalho" aprende OBSERVANDO, e nao so quando a
  // troca passa por `aplicarVelocidade`. A velocidade tambem e redefinida pelo
  // efeito acima (troca de corte, chegada dos Ajustes), e semear a ref na
  // montagem a prendia no valor anterior ao carregamento: alternar caia no
  // fallback de 0,75x em vez de voltar para a velocidade que estava em uso.
  useEffect(() => {
    if (Math.abs(playbackRate - VELOCIDADE_NORMAL) > 0.01) {
      velocidadeTrabalhoRef.current = playbackRate;
    }
  }, [playbackRate]);

  // Quando a geraÃƒÂ§ÃƒÂ£o do bruto termina, traz o corte atualizado (clip_path +
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
      // GeraÃƒÂ§ÃƒÂ£o completa do bruto (vÃƒÂ­deo + cenas) Ã¢â€ â€™ leva para o pÃƒÂ³s-produÃƒÂ§ÃƒÂ£o.
      navigate(postProductionPath(projetoId, corteId, true));
    }
    // Transitou para erro (vindo de qualquer outro estado): notificar.
    if (atual && atual.startsWith('erro:') && anterior !== atual) {
      const msg = atual.replace(/^erro:\s*/, '');
      notifyToast(`GeraÃƒÂ§ÃƒÂ£o de bruto falhou: ${msg}`, { tone: 'error' });
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

  // F-061: divide o corte em dois no ponteiro do player. Exige salvar antes Ã¢â‚¬â€
  // o backend usa os limites/desvios persistidos, entÃƒÂ£o ediÃƒÂ§ÃƒÂµes pendentes
  // seriam ignoradas silenciosamente.
  function onDividirCorteAqui() {
    if (!corteUI || dividirCorte.isPending) return;
    if (isDirty) {
      notifyToast('Salve as alteraÃƒÂ§ÃƒÂµes antes de dividir o corte.', { tone: 'error' });
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
    aplicarVelocidade((rate) => rate + delta);
  }

  function aplicarVelocidade(resolver: (atual: number) => number) {
    setPlaybackRate((atual) => {
      const alvo = Math.max(SPEED_MIN, Math.min(SPEED_MAX, resolver(atual)));
      playerRef.current?.setPlaybackRate(alvo);
      return alvo;
    });
  }

  function alternarVelocidade() {
    aplicarVelocidade((atual) =>
      Math.abs(atual - VELOCIDADE_NORMAL) < 0.01
        ? velocidadeTrabalhoRef.current
        : VELOCIDADE_NORMAL,
    );
  }

  // D-575: funde este corte com o proximo. Como o dividir, exige salvar antes Ã¢â‚¬â€
  // o backend le as bordas e os trechos PERSISTIDOS, entao edicao pendente seria
  // ignorada em silencio. O aviso do confirm e forte de proposito: o outro corte
  // deixa de existir e os artefatos de video sao apagados.
  function onJuntarProximoCorte() {
    if (!corteUI || juntarCortes.isPending) return;
    if (isDirty) {
      notifyToast('Salve as alteraÃƒÂ§ÃƒÂµes antes de juntar os cortes.', { tone: 'error' });
      return;
    }
    if (!nextCut) {
      notifyToast('Este ÃƒÂ© o ÃƒÂºltimo corte: nÃƒÂ£o hÃƒÂ¡ com quem juntar.', { tone: 'error' });
      return;
    }
    const rotulo = nextCut.titulo_proposto?.trim() || `corte #${nextCut.numero}`;
    if (
      !window.confirm(
        `Juntar este corte com ${rotulo}?\n\n` +
          'Trechos a remover, cenas, layout e shorts dos dois sÃƒÂ£o preservados, e o ' +
          'intervalo entre eles vira trecho removido.\n\n' +
          'O outro corte deixa de existir, e o bruto/render jÃƒÂ¡ gerados sÃƒÂ£o apagados ' +
          '(precisam ser gerados de novo).',
      )
    ) {
      return;
    }
    juntarCortes.mutate({ outro_corte_id: nextCut.id });
  }

  // AUDITORIA-v2 Ã‚Â§5 (CP5): atalhos ',' / '.' (Ctrl) para o nudge fino da
  // Sincronia do ÃƒÂ¡udio Ã¢â‚¬â€ mesmo STEP_FINO dos botÃƒÂµes -10/+10, mesma lÃƒÂ³gica
  // de offset jÃƒÂ¡ usada pelo AudioSyncControl (clamp em MIN_MS/MAX_MS).
  // LÃƒÂª a base via editHistory.getPresent() (igual salvarMudancas/patchDirty)
  // em vez de corteUI fechado no closure Ã¢â‚¬â€ os bindings sÃƒÂ£o memoizados e nÃƒÂ£o
  // recalculam a cada tecla, entÃƒÂ£o um valor capturado no closure ficaria
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

  // D-394: bindings vÃƒÂªm do registro central (ids bruto.*) Ã¢â‚¬â€ assim TODA
  // funcionalidade do editor pode ter o atalho reatribuÃƒÂ­do pelo usuÃƒÂ¡rio
  // na pÃƒÂ¡gina Atalhos (overlay wb-keybindings-v1).
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
      shortcutFromRegistry('bruto.juntarCorte', onJuntarProximoCorte),
      shortcutFromRegistry('bruto.alternarVelocidade', alternarVelocidade),
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
      preloadBeforeSec: contextoCorte.antesSeg,
      preloadAfterSec: contextoCorte.depoisSeg,
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

  // Loading enquanto QUALQUER passo roda: vÃƒÂ­deo+cenas (status fica "cortando" atÃƒÂ©
  // o worker inteiro terminar) OU metadados (mutation paralela do front).
  const brutoBusy =
    brutoStatusAtual === 'processando' ||
    brutoMutationPendenteNoCorteAtual ||
    metaClaudeStatus === 'rodando';
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
      <AvaliacaoCorteModal
        open={avaliacaoOpen}
        corteId={corteId}
        onClose={() => setAvaliacaoOpen(false)}
        descricao="O bruto estÃƒÂ¡ sendo gerado em segundo plano"
      />
      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </>
  );

  // Ã¢â€â‚¬Ã¢â€â‚¬ Shell Workbench (Etapa 3): mesma orquestraÃƒÂ§ÃƒÂ£o, re-hospedada Ã¢â€â‚¬Ã¢â€â‚¬
  // Painel CORTES retrÃƒÂ¡til + centro (player 16:9 com cap Ã¢â€ â€™ transporte Ã¢â€ â€™
  // contexto Ã¢â€ â€™ timeline flex:1) + painel direito retrÃƒÂ¡til. A lÃƒÂ³gica acima
  // (hooks, atalhos, dirty, waveform window) ÃƒÂ© EXATAMENTE a mesma do
  // layout legado Ã¢â‚¬â€ sÃƒÂ³ o container muda.
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
            <PanelShell id="right" side="right" title="TRECHOS Ã‚Â· TRANSCRIÃƒâ€¡ÃƒÆ’O">
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
                  onGerarTrechosIA={handleGerarTrechosIA}
                  pendingTrechos={{
                    adicionando: adicionarDesvio.isPending,
                    removendo: removerDesvio.isPending,
                    claude: trechosClaudePendente,
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
          {/* Toolbar do Bruto (AUDITORIA-v2 Ã‚Â§2/Ã‚Â§3, CP2/CP3): veredito em
              ÃƒÂ­cones (reaproveita StatusToggleRow, sÃƒÂ³ muda a apresentaÃƒÂ§ÃƒÂ£o) +
              regerar/pasta/tempos/sincronia/info + chip do vÃƒÂ­deo original +
              pÃƒÂ­lula Salvar flutuante (ÃƒÂºltimo filho flex Ã¢â‚¬â€ reserva a prÃƒÂ³pria
              largura; NÃƒÆ’O ÃƒÂ© position:absolute, nada desliza por baixo). */}
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
                inteiro (cada botÃƒÂ£o era uma caixa com borda prÃƒÂ³pria, e a do
                "regerar" ainda destoava por causa do wrapper do dropdown).
                Cor fica sÃƒÂ³ no glifo Ã¢â‚¬â€ identidade sem o peso de um chip cheio. */}
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
                      // brutoPronto: abre o dropdown p/ escolher o que tambÃƒÂ©m
                      // refazer (mesmo handleRegerarBruto de sempre). 1Ã‚Âª geraÃƒÂ§ÃƒÂ£o
                      // nÃƒÂ£o tem opt-ins Ã¢â‚¬â€ dispara direto (mesmo Ctrl+G/botÃƒÂ£o de
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
                  e "Abrir pasta (Ctrl+O)" ao lado) Ã¢â‚¬â€ atalho que so vive no
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

              <Tooltip label="Sincronia do ÃƒÂ¡udio (H)" side="bottom">
                <button
                  type="button"
                  aria-label="Alternar sincronia do ÃƒÂ¡udio"
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

            {/* Ã¢â€žÂ¹Ã¯Â¸Â Ã¢â‚¬â€ SÃƒâ€œ tooltip via atributo title (AUDITORIA-v2 Ã‚Â§2): sem
                onClick, sem modal. O atalho continua na pÃƒÂ¡gina Atalhos. */}
            <span
              title="Aprovar A Ã‚Â· Rejeitar R Ã‚Â· Fire F Ã‚Â· Tempos T Ã‚Â· Sincronia H Ã‚Â· In/Out [ ] Ã‚Â· Navegar Ã¢â€ ÂÃ¢â€ â€™ 5s Ã‚Â· Desfazer Ctrl+Z"
              className="flex aspect-square min-w-[24px] flex-[0_1_34px] cursor-help items-center justify-center text-[var(--wb-text-dim)]"
            >
              <Info size={14} aria-hidden />
            </span>

            <span className="min-w-0 flex-[0_1_auto] overflow-hidden whitespace-nowrap text-ellipsis rounded-[5px] bg-[var(--wb-bg-inset)] px-2 py-0.5 font-code text-[8.5px] font-bold uppercase text-[var(--wb-text-mute)]">
              VÃƒÂ­deo original Ã‚Â· 4K
            </span>
            {/* D-410: "corte de MM:SS" saiu daqui Ã¢â‚¬â€ virou o campo DuraÃƒÂ§ÃƒÂ£o da
                faixa acima do vÃƒÂ­deo, ao lado da lÃƒÂ­quida. Repetir na toolbar sÃƒÂ³
                gastava largura, que jÃƒÂ¡ faltava em janelas estreitas. */}

            <div className="min-w-2 flex-1" />

            {/* D-407: o Salvar era permanente e so ficava `disabled` quando
                limpo Ã¢â‚¬â€ ocupava a ponta da toolbar sem dizer nada. Agora so
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

          {/* D-410: faixa de leitura do vÃƒÂ­deo. Vem ACIMA do PlayerCap, nunca
              dentro Ã¢â‚¬â€ pela mesma razÃƒÂ£o da Sincronia/Tempos (CP5/CP6): dentro
              ela disputaria altura com o vÃƒÂ­deo no teto de 44vh. ReÃƒÂºne o que
              antes eram chips sobrepostos ÃƒÂ  imagem (BRUTO, velocidade,
              intervalo) e acrescenta duraÃƒÂ§ÃƒÂ£o lÃƒÂ­quida e tempo no corte, que sÃƒÂ³
              existiam no painel Tempos. */}
          <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 rounded-[9px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-1.5">
            <span className="flex-none rounded-[5px] bg-[var(--wb-ink)] px-1.5 py-0.5 font-code text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--wb-ink-fg)]">
              Bruto
            </span>
            <CampoFaixaVideo rotulo="Velocidade" valor={`${playbackRate.toFixed(2)}Ãƒâ€”`} />
            <CampoFaixaVideo rotulo="InÃƒÂ­cio" valor={segParaHms(corteUI.inicio_seg)} />
            <CampoFaixaVideo rotulo="Fim" valor={segParaHms(corteUI.fim_seg)} />
            <CampoFaixaVideo rotulo="DuraÃƒÂ§ÃƒÂ£o" valor={segParaMmSs(durSeg, true)} />
            <CampoFaixaVideo
              rotulo="LÃƒÂ­quido"
              valor={segParaMmSs(liquidoSeg, true)}
              tom="ok"
              titulo="DuraÃƒÂ§ÃƒÂ£o apÃƒÂ³s remover os trechos marcados"
            />
            <CampoFaixaVideo
              rotulo="No corte"
              valor={segParaMmSs(Math.max(0, currentTime - corteUI.inicio_seg), true)}
              tom="accent"
              titulo="PosiÃƒÂ§ÃƒÂ£o do player contada a partir do inÃƒÂ­cio do corte"
            />
          </div>

          <PlayerCap>
            <PlayerPanel
              ref={playerRef}
              variant="overlay"
              posicaoKey={corteId}
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

          {/* Sincronia (AUDITORIA-v2 Ã‚Â§5, CP5): oculta por padrao, alterna
              pelo icone Ã°Å¸Å½Â§ da toolbar. Fica entre o video e o painel de
              Tempos Ã¢â‚¬â€ nunca dentro do PlayerCap (senao disputaria altura
              com o video no teto de 44vh). */}
          {sincroniaAberta && (
            <AudioSyncControl
              variant="workbench"
              offsetMs={corteUI.audio_offset_ms ?? 0}
              onChange={(ms) => patchDirty({ audio_offset_ms: ms })}
              onClose={() => setSincroniaAberta(false)}
            />
          )}

          {/* Tempos (AUDITORIA-v2 Ã‚Â§6, CP6): oculto por padrao, alterna pelo
              icone Ã°Å¸â€¢â€˜ da toolbar. Hospeda titulo/trechos/Intervalo Ã¢â‚¬â€ o
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

          {/* Os 200px do DE-PARA Ã‚Â§3 (quanto mais alto o painel, mais legÃƒÂ­vel a
              onda) eram um `min-height`, e min-height RÃƒÂGIDO nao encolhe: com
              Tempos e/ou Sincronia abertos numa janela baixa a soma dos irmaos
              estourava a coluna e a onda vazava por baixo do `overflow-hidden`
              Ã¢â‚¬â€ media 77px fora em 1600x720 (D-411).
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
              // D-412: o inicio do proximo corte ja era exibido como numero no
              // painel Tempos; aqui ele vira marca na onda, onde a invasao do
              // corte vizinho fica visivel enquanto se arrasta o Out.
              proximoInicioSeg={nextCut?.inicio_seg}
              proximoNumero={nextCut?.numero}
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
              onJuntarProximo={onJuntarProximoCorte}
              juntando={juntarCortes.isPending}
              onAlternarVelocidade={alternarVelocidade}
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
            onJuntarProximoCorte={onJuntarProximoCorte}
            juntandoCorte={juntarCortes.isPending}
            onAlternarVelocidade={alternarVelocidade}
            onGerarManual={() => setTrechosManualOpen(true)}
            onGerarTrechosIA={handleGerarTrechosIA}
            pending={{
              bruto: brutoMutationPendenteNoCorteAtual,
              transcricao: sincTrans.isPending,
              adicionando: adicionarDesvio.isPending,
              removendo: removerDesvio.isPending,
              claude: trechosClaudePendente,
            }}
          />
        </div>
      </div>

      {editorModals}
    </>
  );
}
