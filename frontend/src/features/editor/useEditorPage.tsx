import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAbrirPasta, useExportStatus, useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { useContextoCorte, useVelocidadePlayerPadrao } from '@/features/settings';
import { corteKey, useAdicionarDesvio, useAtualizarCorte, useCorte, useCortesProjeto, useDeletarCorte, useDividirCorte, useJuntarCortes, useRemoverDesvio, useSincronizarTranscricao, useToggleFire, useToggleLeitura } from '@/features/editor/useCortes';
import { useGerarBruto, useStatusBruto } from '@/features/editor/useBruto';
import { useGerarMetadadosClaude, useGerarTrechosClaude, useStatusMetadadosClaude, useTrechosClaudeEmAndamento } from '@/features/editor/useGeracoesDaIa';
import { cortesApi } from '@/features/editor/api/cortes';
import { useToast } from '@/components/ui/toaster';
import { useConfirmacao } from '@/components/ui/confirm-dialog';
import { estaAprovado, statusAoAlternarVeredito } from '@/lib/statusDoCorte';
import type { Corte, Desvio } from '@/types/models';
import { type PlayerHandle } from './fase1/PlayerPanel';
import { MAX_MS, MIN_MS, STEP_FINO } from './fase1/AudioSyncControl';
import {
  OPCOES_REGERAR_VAZIAS,
  planejarRegeracaoBruto,
  type RegerarBrutoOpcoes,
} from './regerarBrutoPlan';
import { confirmacaoExcluirCorte, confirmacaoRegerarBruto, confirmacaoRegerarTrechos } from './regeracaoConfirmacao';
import { useShortcuts, type ShortcutBinding } from '@/shared/atalhos/shortcuts';
import { shortcutFromRegistry } from '@/shared/atalhos/shortcutsRegistry';
import { useEditHistory } from './useEditHistory';
import { calcularDuracaoLiquida, segParaHms } from './timeUtils';
import { selectDesvioIdxByTime } from './fase1/desvioUtils';
import { applyDesvioChange, desfechoDaFalhaAoSalvar, mergeDirtyPatch, type WaveformWindow } from './editorEditState';
import {
  postProductionPath,
  resolveCorteStagePath,
} from '@/features/post-production/postProductionNavigation';


// D-599: com a casca nova, quem desenha a lista de cortes, a trilha e a
// barra de decisao e a CASCA — o editor apenas a alimenta (BancadaChrome).
// Lido uma vez, no modulo, pela mesma razao do router: casca e tela nunca
// podem ficar em versoes diferentes dentro da mesma sessao.

export function findPreviousApprovedCorte(cortes: Corte[], corte: Corte): Corte | null {
  return (
    cortes
      .filter(
        (item) =>
          item.id !== corte.id &&
          item.numero < corte.numero &&
          estaAprovado(item.status),
      )
      .sort((a, b) => b.numero - a.numero)[0] ?? null
  );
}

export function findNextCorte(cortes: Corte[], corte: Corte): Corte | null {
  return (
    cortes
      .filter((item) => item.id !== corte.id && item.numero > corte.numero)
      .sort((a, b) => a.numero - b.numero)[0] ?? null
  );
}

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
// D-575: os dois polos da alternancia de velocidade. 1x e onde se confere o
// resultado; a "de trabalho" e a ultima velocidade != 1x que esteve em uso.
export const VELOCIDADE_NORMAL = 1;
// Semente para quem nunca saiu do 1x: o pedido nasceu de precisar ouvir
// DEVAGAR para acertar a borda do corte, entao o primeiro toque desacelera.
export const VELOCIDADE_TRABALHO_INICIAL = 0.75;


// D-394: os ids do registro central — todo atalho do editor pode ser
// reatribuído na página Atalhos.
export const ATALHOS_DO_EDITOR = [
  'player.togglePlay',
  'bruto.frameAnterior',
  'bruto.frameProximo',
  'bruto.seekBack5s',
  'bruto.seekFwd5s',
  'bruto.speedDown',
  'bruto.speedUp',
  'bruto.corteAnterior',
  'bruto.proximoCorte',
  'bruto.inAqui',
  'bruto.outAqui',
  'bruto.aprovar',
  'bruto.rejeitar',
  'bruto.fire',
  'bruto.leitura',
  'bruto.travarTrecho',
  'bruto.modoPonteiro',
  'bruto.adicionarTrecho',
  'bruto.dividirCorte',
  'bruto.juntarCorte',
  'bruto.alternarVelocidade',
  'bruto.removerTrecho',
  'bruto.smartPlay',
  'bruto.sincroniaNudgeMenos',
  'bruto.sincroniaNudgeMais',
  'bruto.undo',
  'bruto.redo',
  'bruto.salvar',
  'bruto.gerarBruto',
  'bruto.abrirPasta',
  'bruto.mostrarAtalhos',
] as const;

// D-729: o container de EditorPage — estado, efeitos e ações. A view, em
// EditorPage.tsx, só desenha o que este hook devolve.
export function useEditorPage() {
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
  // D-451: respiro configuravel antes/depois do corte — define a janela de onda
  // carregada e, com ela, o offset que casa o tempo do audio com o do video.
  const contextoCorte = useContextoCorte();
  const [playbackRate, setPlaybackRate] = useState(velocidadePadrao);
  // D-575: a ultima velocidade != 1x que esteve em uso. Afinar a borda de um
  // corte pede ouvir devagar e conferir pede 1x, e a ida e volta e sempre entre
  // esses dois valores — guardar o "devagar" evita refazer o caminho no Ctrl+J/K
  // a cada troca. Ref, e nao state: e memoria do gatilho, nao coisa que a tela
  // desenha, e os bindings de atalho sao memoizados (state ficaria stale).
  const velocidadeTrabalhoRef = useRef(VELOCIDADE_TRABALHO_INICIAL);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trechosManualOpen, setTrechosManualOpen] = useState(false);
  // D-419: avaliação da qualidade do corte, perguntada uma única vez — no
  // clique que dispara a 1ª geração do bruto.
  const [avaliacaoOpen, setAvaliacaoOpen] = useState(false);
  const [intervaloAberto, setIntervaloAberto] = useState(false);
  // Trecho comeca DESTRAVADO por default (decisao de produto): usuario pode
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
  // exportStatus só lista APROVADO/PROCESSADO. is_pos_producao do
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

  // D-746: trocar de corte (J/K, lista, link) com ajuste não salvo perdia o
  // ajuste em silêncio. Agora a saída espera o salvamento; se ele falhar, a
  // tela fica e diz por quê.
  const saida = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  // Só a mudança de estado do bloqueio dispara; o resto é lido na hora.
  const salvarAntesDeSair = useEffectEvent(() => {
    if (saida.state !== 'blocked') return;
    const pendentes = editHistory.getPresent();
    if (Object.keys(pendentes).length === 0) {
      saida.proceed();
      return;
    }
    atualizarCorte.mutate(
      { ...pendentes },
      {
        onSuccess: () => {
          editHistory.reset({});
          notifyToast('Ajustes do corte salvos antes de sair.', { tone: 'success' });
          saida.proceed();
        },
        onError: (erro) => {
          const desfecho = desfechoDaFalhaAoSalvar(erro);
          notifyToast(desfecho.mensagem, { tone: desfecho.tom });
          if (!desfecho.sair) return saida.reset();
          editHistory.reset({});
          saida.proceed();
        },
      },
    );
  });
  useEffect(() => {
    salvarAntesDeSair();
  }, [saida.state]);

  // Fechar a aba não passa pelo roteador: o navegador pergunta.
  useEffect(() => {
    if (!isDirty) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [isDirty]);
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
  // D-420 — as gerações via Claude são longas (dezenas de segundos) e o editor
  // NÃO remonta ao trocar de corte: lidas direto do `isPending` da mutação, elas
  // desabilitavam o botão do corte novo por causa da execução do anterior. Estes
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

  // F-038 — 1ª geração (corte sem bruto): cadeia completa. Dispara metadados via
  // Claude em paralelo (texto não depende dos silêncios); o backend, ao ver que
  // não há bruto, encadeia transcrição + cenas sozinho.
  const handleGerarBrutoInicial = () => {
    if (brutoOcupado()) return;
    dispararBruto(undefined);
    gerarMetadadosClaude.mutate('claude');
    // D-419: pergunta a qualidade AGORA, não quando o bruto ficar pronto — é
    // neste clique que o editor acabou de ver e ajustar o corte. A geração já
    // saiu acima e corre em segundo plano; o modal não a bloqueia.
    setAvaliacaoOpen(true);
  };

  // D-160 — regeração (bruto já existe): por DEFAULT roda só o bruto. Os opt-ins
  // marcados no dropdown ("Também refazer") ligam transcrição/cenas (flags do
  // endpoint) e metadados/desvios (mutations separadas). Desvios alteram o
  // recorte, então rodam ANTES do bruto.
  const executarRegeracaoBruto = async (opts: RegerarBrutoOpcoes) => {
    const plano = planejarRegeracaoBruto(opts);
    if (plano.desvios) {
      try {
        await gerarTrechosClaude.mutateAsync('claude');
      } catch {
        // Erro já é notificado pelo hook; segue com o bruto assim mesmo.
      }
    }
    dispararBruto(plano.bruto);
    if (plano.metadados) gerarMetadadosClaude.mutate('claude');
  };

  // D-428 — com bruto já na mão, regerar substitui o vídeo atual: passa pela
  // confirmação antes de sair. Cobre o Ctrl+G, o botão principal e o "Regerar
  // bruto" do dropdown, que caíam todos aqui.
  const handleRegerarBruto = (opts: RegerarBrutoOpcoes = OPCOES_REGERAR_VAZIAS) => {
    if (brutoOcupado()) return;
    confirmacao.executarOuPedir(confirmacaoRegerarBruto(brutoPronto, opts), () =>
      void executarRegeracaoBruto(opts),
    );
  };

  // Botão/atalho principal: 1ª vez → cadeia completa; regeração → só o bruto.
  const handleGerarBrutoPrincipal = () => {
    if (brutoPronto) handleRegerarBruto();
    else handleGerarBrutoInicial();
  };

  // D-428 — analisar trechos de novo acrescenta à lista já revisada e custa
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
  // quando a preferencia chega da API ou muda no painel — sem arrastar
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
    await cortesApi.adicionarDesvio(corteId, {
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

  // D-575: funde este corte com o proximo. Como o dividir, exige salvar antes —
  // o backend le as bordas e os trechos PERSISTIDOS, entao edicao pendente seria
  // ignorada em silencio. O aviso do confirm e forte de proposito: o outro corte
  // deixa de existir e os artefatos de video sao apagados.
  function onJuntarProximoCorte() {
    if (!corteUI || juntarCortes.isPending) return;
    if (isDirty) {
      notifyToast('Salve as alterações antes de juntar os cortes.', { tone: 'error' });
      return;
    }
    if (!nextCut) {
      notifyToast('Este é o último corte: não há com quem juntar.', { tone: 'error' });
      return;
    }
    const rotulo = nextCut.titulo_proposto?.trim() || `corte #${nextCut.numero}`;
    if (
      !window.confirm(
        `Juntar este corte com ${rotulo}?\n\n` +
          'Trechos a remover, cenas, layout e shorts dos dois são preservados, e o ' +
          'intervalo entre eles vira trecho removido.\n\n' +
          'O outro corte deixa de existir, e o bruto/render já gerados são apagados ' +
          '(precisam ser gerados de novo).',
      )
    ) {
      return;
    }
    juntarCortes.mutate({ outro_corte_id: nextCut.id });
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
    atualizarCorte.mutate({ status: statusAoAlternarVeredito(corteUI.status) });
  }

  const deletarCorte = useDeletarCorte(corteId, projetoId);

  // D-842: R exclui, e o A alterna aprovado ↔ proposto. Na D-746 o R só
  // devolvia a proposto — o mesmo que o A já fazia. Excluir é irreversível,
  // então a tecla sozinha nunca basta: o diálogo do shell (não o confirm do
  // navegador, que um Enter atravessava) é quem decide.
  function excluirCorte() {
    if (!corteUI) return;
    confirmacao.executarOuPedir(
      confirmacaoExcluirCorte(corteUI.numero, corteUI.titulo_proposto),
      excluirConfirmado,
    );
  }

  function excluirConfirmado() {
    deletarCorte.mutate(undefined, {
      onSuccess: () => {
        // D-883: o ajuste morre com o corte — a saída o salvaria no excluído (404).
        editHistory.reset({});
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

  // D-394: bindings vêm do registro central (ids bruto.*) — assim TODA
  // funcionalidade do editor pode ter o atalho reatribuído pelo usuário
  // na página Atalhos (overlay wb-keybindings-v1).
  // As ligações nascem uma vez e chamam a versão ATUAL de cada ação. Antes o
  // useMemo só as refazia quando corte, corteId ou isDirty mudavam: as outras
  // ações rodavam com o valor da época (D-730). Recriá-las a cada render
  // religaria o teclado a cada tique do player.
  const acoesDosAtalhos = useRef<Record<string, () => void>>({});
  useLayoutEffect(() => {
    acoesDosAtalhos.current = {
      'player.togglePlay': () => playerRef.current?.togglePlay(),
      'bruto.frameAnterior': () => playerRef.current?.step(-1 / 30),
      'bruto.frameProximo': () => playerRef.current?.step(1 / 30),
      'bruto.seekBack5s': () => onSkip(-5),
      'bruto.seekFwd5s': () => onSkip(5),
      'bruto.speedDown': () => onChangeSpeed(-0.25),
      'bruto.speedUp': () => onChangeSpeed(0.25),
      'bruto.corteAnterior': () => navegarCorte(-1),
      'bruto.proximoCorte': () => navegarCorte(1),
      'bruto.inAqui': setInicioAtual,
      'bruto.outAqui': setFimAtual,
      'bruto.aprovar': toggleAprovado,
      'bruto.rejeitar': excluirCorte,
      'bruto.fire': () => toggleFire.mutate(),
      'bruto.leitura': () => corte && toggleLeitura.mutate(corte),
      'bruto.travarTrecho': () => setTrechoLocked((v) => !v),
      'bruto.modoPonteiro': () => setPointerMode((v) => !v),
      'bruto.adicionarTrecho': adicionarTrechoAqui,
      'bruto.dividirCorte': onDividirCorteAqui,
      'bruto.juntarCorte': onJuntarProximoCorte,
      'bruto.alternarVelocidade': alternarVelocidade,
      'bruto.removerTrecho': onRemoverTrechoSelecionado,
      'bruto.smartPlay': () => setSmartPlay((v) => !v),
      'bruto.sincroniaNudgeMenos': () => nudgeSincronia(-STEP_FINO),
      'bruto.sincroniaNudgeMais': () => nudgeSincronia(STEP_FINO),
      'bruto.undo': editHistory.undo,
      'bruto.redo': editHistory.redo,
      'bruto.salvar': salvarMudancas,
      'bruto.gerarBruto': () => handleGerarBrutoPrincipal(),
      'bruto.abrirPasta': () => abrirPasta.mutate(corteId),
      'bruto.mostrarAtalhos': () => setShortcutsOpen(true),
    };
  });
  const bindings: ShortcutBinding[] = useMemo(
    () =>
      ATALHOS_DO_EDITOR.map((id) => shortcutFromRegistry(id, () => acoesDosAtalhos.current[id]?.())),
    [],
  );

  useShortcuts(bindings, !!corte);

  return { adicionarDesvio, adicionarTrechoAqui, alternarVelocidade, atualizarCorte, avaliacaoOpen, bindings, brutoMutationPendenteNoCorteAtual, brutoPronto, brutoStatusAtual, confirmacao, contextoCorte, corte, corteId, corteQuery, corteUI, cortes, cortesQuery, currentTime, dividirCorte, excluirCorte, exportStatusQ, handleGerarBrutoPrincipal, handleGerarTrechosIA, intervaloAberto, isDirty, juntarCortes, liquidoSeg, metaClaudeStatus, nextCut, onAdicionarDesvio, onChangeDesvio, onChangeSpeed, onCriarCorteDaSelecao, onDividirCorteAqui, onJuntarProximoCorte, onRemoverDesvio, onSeekTimeline, onSelectDesvioByTime, patchDirty, playbackRate, playerRef, pointerMode, previousCut, projeto, projetoId, qc, removerDesvio, salvarMudancas, selectedDesvioIdx, setAvaliacaoOpen, setCurrentTime, setFimAtual, setInicioAtual, setIntervaloAberto, setPointerMode, setShortcutsOpen, setSmartPlay, setTrechoLocked, setTrechosManualOpen, setWaveformRefreshKey, shortcutsOpen, sincTrans, smartPlay, statusBruto, toggleAprovado, toggleFire, toggleLeitura, trechoLocked, trechosClaudePendente, trechosManualOpen, waveformRefreshKey, waveformWindowRef };
}
