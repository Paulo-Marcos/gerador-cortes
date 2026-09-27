import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useExportStatus, useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { useVelocidadePlayerPadrao } from '@/features/settings';
import { useRenderFinal, useStudioUrl } from '@/features/editor/useRender';
import { useAtualizarCorte, useCorte, useCortesProjeto, useToggleFire } from '@/features/editor/useCortes';
import { useGerarBruto, useStatusBruto } from '@/features/editor/useBruto';
import { finalVideoUrl, gradedVideoUrl, rawVideoBustedUrl } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import type { CenaRemotion, Corte } from '@/types/models';
import type { PlayerHandle } from '@/features/editor/fase1/PlayerPanel';
import { EditorFase2 } from '@/features/editor/fase2/EditorFase2';
import { criarRelogioDoPlayer } from '@/features/editor/fase2/relogioDoPlayer';
import { useShortcuts, type ShortcutBinding } from '@/shared/atalhos/shortcuts';
import { shortcutFromRegistry } from '@/shared/atalhos/shortcutsRegistry';
import { Icon } from '@/upgrade/Icon';
import { montarTira } from '@/upgrade/tiraDoCorte';
import { BancadaChrome } from '@/features/editor/BancadaChrome';
import { MetadadosDoCorteModal, statusMinimo } from '@/features/metadata/MetadadosDoCorteModal';
import { TiraDoCorteAp } from '@/upgrade/TiraDoCorteAp';
import { useWorkbenchQueueOptional } from '@/shared/filaGlobal/useWorkbenchQueue';
import { rotuloCurtoProjeto } from '@/shared/filaGlobal/rotulo';
import { AvaliacaoCorteModal } from '@/features/editor/avaliacao/AvaliacaoCorteModal';
import { RenderStepsModal } from './RenderStepsModal';

// D-599: com a casca nova quem desenha a lista de cortes, a trilha e a barra
// de decisao e a CASCA — a tela apenas a alimenta (BancadaChrome).

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
  resolverVideoFonte,
  fontesDisponiveis,
  resolverVideoFonteEfetiva,
  type VideoFontePos,
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
  // D-657: o tempo do player mora num relógio, não no estado da página. Aqui
  // ele só era repassado — e cada um dos 30 frames/s re-renderizava a tela toda.
  const [relogio] = useState(() => criarRelogioDoPlayer());
  // D-450: velocidade padrao vinda de Ajustes (app_settings).
  const velocidadePadrao = useVelocidadePlayerPadrao();
  const [playbackRate, setPlaybackRate] = useState(velocidadePadrao);
  // Cache-buster do <video>: bumpado automaticamente quando a geração do
  // bruto termina (status -> 'pronto') para o Remotion Player remontar com a
  // URL nova (via `key={src}` no Player) e re-fetchar o arquivo do disco.
  const [videoBust, setVideoBust] = useState<number>(() => Date.now());
  const [metadataOpen, setMetadataOpen] = useState(false);
  // D-419: a nota do corte é perguntada uma vez, no clique de "Gerar bruto"
  // (tela Bruta). Aqui ela só fica reabrível para ajuste.
  const [avaliacaoOpen, setAvaliacaoOpen] = useState(false);
  // D-430: fonte do player escolhida a mao. `null` = segue o padrao
  // bruto-first do D-368. Zerada ao trocar de corte (effect abaixo).
  const [fonteEscolhida, setFonteEscolhida] = useState<VideoFontePos | null>(null);
  const ultimoStatusBrutoRef = useRef<string | undefined>(undefined);
  const gradeFaseRef = useRef(false);
  const brutoEmGeracaoRef = useRef(false);
  const playerRef = useRef<PlayerHandle>(null);
  const { notify: notifyToast } = useToast();

  const brutoEmGeracao =
    statusBruto.data?.status === 'cortando' || statusBruto.data?.status === 'processando';

  // D-450: o Player abre na velocidade configurada em Ajustes — reaplica
  // quando a preferencia chega da API ou muda no painel.
  useEffect(() => {
    setPlaybackRate(velocidadePadrao);
  }, [velocidadePadrao]);

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
  // Fila global do Workbench: registrar o job deixa o render visível em
  // qualquer tela (a aba não bloqueia). Null no shell legado.
  const workbenchQueue = useWorkbenchQueueOptional();
  const {
    renderFinal,
    pipelineStatus,
    marcado: renderFinalLocal,
    rodando: renderFinalRunning,
    progresso: renderFinalProgress,
    modalDeInicioAberto: renderStartModalOpen,
    setModalDeInicioAberto: setRenderStartModalOpen,
    pedir: renderizarFinal,
    iniciar: startRenderFinal,
  } = useRenderFinal(corteId, {
    aoMudarStatus: () => void exportStatusQ.refetch(),
    aoAcabar: ({ concluiu, falhou, status }) => {
      // D-746: a falha só limpava o estado — o operador ficava esperando um
      // render que já tinha morrido.
      if (falhou) {
        notifyToast(`O render final falhou: ${status.error || 'o backend não disse por quê'}.`, {
          tone: 'error',
        });
        return;
      }
      // Render concluído: jogar o usuário direto na tela final, mesmo com
      // ?fase=2 preservado, porque aqui o vídeo passou a estar pronto.
      const renderTarget = resolveRenderCompletionPath({ projetoId, corteId, finished: concluiu });
      if (renderTarget) navigate(renderTarget, { replace: true });
    },
    // A fila global acompanha o render: "renderizar em 2º plano" não bloqueia a aba.
    aoIniciar: () =>
      workbenchQueue?.registerJob({
        corteId,
        projetoId,
        rotulo: `${rotuloCurtoProjeto(projeto.data?.titulo_live)} · corte ${corte?.numero ?? '?'} → render`,
      }),
    aoFalharAoIniciar: (erro) =>
      notifyToast(
        `Não consegui iniciar o render: ${erro instanceof Error ? erro.message : 'erro desconhecido'}.`,
        { tone: 'error' },
      ),
  });
  const gerarBruto = useGerarBruto(corteId, projetoId);
  // D-746: veredito e Fire de verdade na Pós. Antes "Aprovar corte" disparava
  // o render final e o Fire era um botão que não fazia nada.
  const atualizarCorte = useAtualizarCorte(corteId, projetoId);
  const alternarFire = useToggleFire(corteId, projetoId);
  const confirmacao = useConfirmacao();
  const studioUrl = useStudioUrl(corteId);

  const payload = useMemo(() => parseCenasPayload(corte?.cenas_remotion), [corte?.cenas_remotion]);

  useEffect(() => {
    setCenas(payload.cenas);
    relogio.marcar(0);
  }, [payload.cenas, corteId, relogio]);

  useEffect(() => {
    setFonteEscolhida(null);
  }, [corteId]);

  // D-430: `usePipelineStatus` so faz polling durante o render, entao quando a
  // regeracao do bruto termina o `fases.raw` continua `false` em cache — o
  // botao "Regerar bruto" ficava na tela e o player seguia na fonte antiga ate
  // um reload. Refetcha na borda de descida de `brutoEmGeracao`.
  useEffect(() => {
    if (brutoEmGeracaoRef.current && !brutoEmGeracao) {
      void pipelineStatus.refetch();
    }
    brutoEmGeracaoRef.current = brutoEmGeracao;
  }, [brutoEmGeracao, pipelineStatus]);

  // I-030: assim que pipelineStatus reporta fases.grade=true, forca o refetch
  // do exportStatus para o checklist/sidebar refletirem grade_pronta sem
  // esperar o poll de 8s. (Ate D-430 o backend tambem apagava o raw nesse
  // ponto; hoje o bruto sobrevive, mas o refetch segue valendo pela grade.)
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
      onError: (erro) => {
        popup?.close();
        notifyToast(
          `Não consegui abrir o Studio: ${erro instanceof Error ? erro.message : 'erro desconhecido'}.`,
          { tone: 'error' },
        );
      },
    });
  }

  // videoSrc bruto-first (D-368): o PADRAO vem de `resolverVideoFonte` —
  // enquanto o clip_raw existe no disco (`fases.raw`), o player mostra o BRUTO.
  // `!== false` mantem o bruto como padrao enquanto o pipelineStatus nao
  // carregou, pra nao piscar graded antes do primeiro fetch.
  // D-430: o usuario pode sobrepor esse padrao pelo seletor de fonte; a escolha
  // so vale enquanto a fonte existir (`resolverVideoFonteEfetiva`).
  const exportEntry = exportStatusQ.data?.cortes.find((c) => c.corte_id === corte.id);
  const videoPronto = Boolean(exportEntry?.video_pronto);
  const brutoDisponivel = pipelineStatus.data?.fases?.raw !== false;
  const videoFonteAutomatica = resolverVideoFonte({ videoPronto, brutoDisponivel });
  const fontes = fontesDisponiveis({
    brutoDisponivel,
    gradedDisponivel: Boolean(pipelineStatus.data?.fases?.grade),
    videoPronto,
  });
  const videoFonte = resolverVideoFonteEfetiva({
    escolhida: fonteEscolhida,
    disponiveis: fontes,
    automatica: videoFonteAutomatica,
  });
  const videoSrc =
    videoFonte === 'final'
      ? `${finalVideoUrl(projetoId, corte.id)}?v=${videoBust}`
      : videoFonte === 'raw'
        ? rawVideoBustedUrl(corte.id, videoBust)
        : `${gradedVideoUrl(projetoId, corte.id)}?v=${videoBust}`;

  // D-430: o bruto so some na limpeza do projeto. Quando isso acontece e o
  // usuario precisa retrabalhar o pos, este botao re-extrai o trecho da live.
  const brutoAusente = pipelineStatus.data?.fases?.raw === false;
  const gerandoBruto = gerarBruto.isPending || brutoEmGeracao;

  const aprovadoNaPos = ['aprovado', 'processado'].includes(corte.status);

  function alternarAprovado() {
    atualizarCorte.mutate({ status: aprovadoNaPos ? 'proposto' : 'aprovado' });
  }

  function regerarBruto() {
    confirmacao.executarOuPedir(
      {
        titulo: 'Regerar video bruto',
        descricao:
          'O trecho e re-extraido da live. Cenas, layout e metadados ja editados sao mantidos.',
        detalhe: `Corte ${corte?.numero ?? '?'} · ${corte?.titulo_proposto ?? ''}`,
        confirmLabel: 'Regerar bruto',
      },
      () => gerarBruto.mutate({ refazer_transcricao: false, refazer_cenas: false }),
    );
  }

  // I-025 (freeze player na render): video estavel — pinnedSrc declarado
  // como hook no topo do componente (antes dos early returns); aqui so
  // compomos o valor efetivo apos videoSrc estar resolvido.
  liveSrcRef.current = videoSrc;
  const videoSrcEstavel = pinnedSrc ?? videoSrc;

  const exportStatuses = exportStatusQ.data?.cortes ?? [];

  const posModals = (
    <>
      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
      <RenderStepsModal
        open={renderStartModalOpen}
        status={pipelineStatus.data}
        onClose={() => setRenderStartModalOpen(false)}
        onConfirm={startRenderFinal}
      />
      {/* R4: um modal de metadados só na casca — o mesmo de Cortes. */}
      {metadataOpen ? (
        <MetadadosDoCorteModal
          projetoId={projetoId}
          status={exportEntry ?? statusMinimo(corte)}
          statusCorte={corte.status}
          aoFechar={() => setMetadataOpen(false)}
        />
      ) : null}
      <AvaliacaoCorteModal
        open={avaliacaoOpen}
        corteId={corte.id}
        onClose={() => setAvaliacaoOpen(false)}
        descricao={corte.titulo_proposto}
      />
    </>
  );

  // ── Shell Workbench (Etapa 4): steps no topo do conteúdo da aba, painel
  // CORTES retrátil e o EditorFase2 (player+timeline+painéis de cenas/
  // layout/filtros com todos os atalhos) re-hospedado intacto no centro.

  const caminhoDoCorte = (item: Corte) =>
    resolveCorteStagePath({
      projetoId,
      corte: item,
      status: exportStatuses.find((status) => status.corte_id === item.id),
      forcePhase2,
    });

  return (
    <>
      <BancadaChrome
        projetoId={projetoId}
        tituloLive={projeto.data?.titulo_live ?? 'Live'}
        cortes={cortes}
        corte={corte}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        caminhoDoCorte={caminhoDoCorte}
        sub={[
          `${cenas.length} cenas`,
          payload.formato,
          renderFinalRunning ? `render ${renderFinalProgress}%` : videoPronto ? 'render pronto' : 'render pendente',
        ]
          .filter(Boolean)
          .join(' · ')}
        fire={corte.is_fire}
        sujo={false}
        salvando={false}
        brutoPronto={!brutoAusente}
        brutoOcupado={gerandoBruto}
        // O botão do topo diz "Regerar bruto": ele regera o BRUTO. Estava
        // ligado ao render final — um verbo, outra ação.
        onGerarBruto={regerarBruto}
        onToggleFire={() => alternarFire.mutate()}
        fireOcupado={alternarFire.isPending}
        onAprovar={alternarAprovado}
        barra={{
          // D-746: um verbo por botão. O primário renderiza, e só ele; o
          // veredito é um par separado e reversível; Enter não dispara GPU.
          veredito: {
            aprovado: aprovadoNaPos,
            ocupado: atualizarCorte.isPending,
            onAlternar: alternarAprovado,
          },
          primario: {
            texto: renderFinalRunning
              ? `Renderizando ${renderFinalProgress}%`
              : videoPronto
                ? 'Renderizar de novo'
                : 'Renderizar final',
            icone: renderFinalRunning ? 'loader' : 'clapperboard',
            onClick: renderizarFinal,
            desabilitado: renderFinalRunning || brutoAusente,
            motivo: brutoAusente
              ? 'Sem o vídeo bruto (a limpeza apagou): regere o bruto antes de renderizar.'
              : undefined,
            semEnter: true,
          },
        }}
      />

      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >

        {exportEntry ? (
          // D-746: a mesma tira da lista de Cortes — o operador não precisa
          // voltar à lista para saber se o corte tem capa e metadados. O
          // painel de fases do render continua: ele diz o que ESTA execução
          // roda; a tira diz o estado do corte.
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              padding: '0 2px 8px',
            }}
          >
            <TiraDoCorteAp tira={montarTira(exportEntry, corte.status)} />
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              onClick={() => setMetadataOpen(true)}
              title="Metadados do corte — abre aqui, sem sair da Pós"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }}
            >
              <Icon name="tags" size={12} />
              Metadados
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <EditorFase2
            videoSrc={videoSrcEstavel}
            modoLabel="Cenas"
            corte={corte}
            cenas={cenas}
            formato={payload.formato}
            paleta={payload.paleta}
            playerRef={playerRef}
            relogio={relogio}
            onSeek={(seg) => playerRef.current?.seekTo(seg)}
            onCenasChange={setCenas}
            onAbrirStudio={abrirStudio}
            abrindoStudio={studioUrl.isPending}
            playbackRate={playbackRate}
          />
        </div>
      </div>

      {posModals}
    </>
  );
}

