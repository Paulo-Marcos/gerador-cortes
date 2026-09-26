import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Brain,
  Loader2,
  Plus,
  Rocket,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Send,
} from 'lucide-react';
import { AdicionarCorteModal } from '@/features/editor/AdicionarCorteModal';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import {
  useAbrirPasta,
  useAnalisarDesviosTodos,
  useExportStatus,
  useLiberarPublicacao,
  useMarcarPublicadoYouTube,
  useProjeto,
  useProjetoProgressoWS,
  useRefazerTranscricao,
  useUploadYouTube,
} from '@/hooks/useProjetoDetalhe';
import { moverCorte, useCortesProjeto, useReordenarCortes } from '@/hooks/useEditor';
import { useFalantes } from '@/hooks/useDiarizacao';
import { useWarmupWaveforms } from '@/hooks/useWarmupWaveforms';
import { cn, formatarDataLive, formatarDuracaoHMS, thumbnailUrl } from '@/lib/utils';
import { resolveThumbUrl } from '@/lib/api';
import type { Corte, DestinoPublicacao, StatusExportCorte } from '@/types/models';
import { MenuDeIa } from '@/components/ui/acao-de-ia';
import type { ProviderIA } from '@/lib/providerIa';
import { AnaliseIaModal } from './AnaliseIaModal';
import { AuditoriaAnaliseModal } from './AuditoriaAnaliseModal';
import { PublicarMassaModal } from './PublicarMassaModal';
import { PublicarTiktokModal } from './PublicarTiktokModal';
import { cortesParaTiktok, cortesParaYoutube, destinosPublicados } from './listasDePublicacao';
import { mesclarCortesComExport } from './cortesDoWorkspace';
import { avaliarProntidaoPublicacao } from './prontidaoPublicacao';
import { StatusPipStrip } from './StatusPills';
import { VotoQualidadeLive } from './VotoQualidadeLive';

// Ícone do cluster UTILITÁRIOS (protótipo v3 §Workspace): 32×30, sem borda e
// sem fundo próprios — quem tem é o cluster. A cor do glifo vem de fora, uma
// por ferramenta: tudo cinza deixava a fileira morta.
const UTILITARIO_CLASS =
  'flex h-[30px] w-8 items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--wb-bg-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:pointer-events-none disabled:opacity-40';

export function ProjetoDetalhePage() {
  const { id = '' } = useParams<{ id: string }>();
  const projeto = useProjeto(id);
  const cortesQuery = useCortesProjeto(id);
  const exportStatus = useExportStatus(id);
  const progresso = useProjetoProgressoWS(id);

  const navigate = useNavigate();
  const [analiseOpen, setAnaliseOpen] = useState(false);
  const [auditoriaOpen, setAuditoriaOpen] = useState(false);
  const [publicarOpen, setPublicarOpen] = useState(false);
  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [adicionarCorteOpen, setAdicionarCorteOpen] = useState(false);
  const [uploadingCorteId, setUploadingCorteId] = useState<string | null>(null);
  const [manualPublishCorte, setManualPublishCorte] = useState<StatusExportCorte | null>(null);
  // D-566: corte cuja publicacao o operador quer desfazer (e em qual destino).
  const [liberarCorte, setLiberarCorte] = useState<StatusExportCorte | null>(null);
  const [manualYoutubeUrl, setManualYoutubeUrl] = useState('');
  const [, setManualPublishCorteId] = useState<string | null>(null);

  const { notify } = useToast();
  const refazerTranscricao = useRefazerTranscricao(id);
  const uploadYoutube = useUploadYouTube();
  const marcarPublicado = useMarcarPublicadoYouTube();
  const liberarPublicacao = useLiberarPublicacao();
  const reordenar = useReordenarCortes(id);
  const analisarDesviosTodos = useAnalisarDesviosTodos(id);

  function moverCorteNaLista(corteId: string, delta: -1 | 1) {
    const ordemAtual = (cortesQuery.data ?? []).map((c) => ({ id: c.id }));
    const novaOrdem = moverCorte(ordemAtual, corteId, delta);
    if (novaOrdem) reordenar.mutate(novaOrdem);
  }

  function atualizarDadosEstudio() {
    void projeto.refetch();
    void exportStatus.refetch();
    void cortesQuery.refetch();
  }

  function dispararRefazerTranscricao() {
    refazerTranscricao.mutate(undefined, {
      onSuccess: (data) =>
        notify(
          `Transcricao re-baixada (json3). ${data.total_cortes_sincronizados} cortes re-sincronizados.`,
          { tone: 'success' },
        ),
      onError: (error) =>
        notify(error instanceof Error ? error.message : 'Falha ao refazer transcricao.', {
          tone: 'error',
        }),
    });
  }

  function dispararAnalisarDesviosTodos(provider: ProviderIA) {
    const nome = provider === 'gemini' ? 'Gemini' : 'Claude';
    if (
      !confirm(
        `Gerar trechos a remover com o ${nome} para TODOS os cortes deste projeto?\n\n` +
          'A operação roda em segundo plano, corte a corte (pode levar minutos) — ' +
          'os desvios encontrados vão aparecendo aos poucos. Os trechos já marcados ' +
          'NÃO são removidos: esta ação só ACRESCENTA.',
      )
    )
      return;
    analisarDesviosTodos.disparar(provider);
  }

  function publicarCorteIndividual(corteId: string) {
    setUploadingCorteId(corteId);
    uploadYoutube.mutate(
      { corteId, body: { scheduled_at: null } },
      {
        onSuccess: (data) => {
          notify(data.mensagem || 'Upload enviado para o YouTube.', { tone: 'success' });
          atualizarDadosEstudio();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : 'Falha ao enviar para o YouTube.', {
            tone: 'error',
          }),
        onSettled: () => setUploadingCorteId(null),
      },
    );
  }

  function abrirMarcarPublicado(corte: StatusExportCorte) {
    setManualPublishCorte(corte);
    setManualYoutubeUrl(corte.youtube_url_publicado || '');
  }

  function fecharMarcarPublicado() {
    if (marcarPublicado.isPending) return;
    setManualPublishCorte(null);
    setManualYoutubeUrl('');
  }

  function confirmarMarcarPublicado() {
    const youtubeUrl = manualYoutubeUrl.trim();
    if (!manualPublishCorte || !youtubeUrl) {
      notify('Informe a URL ou ID do video no YouTube.', { tone: 'warning' });
      return;
    }

    setManualPublishCorteId(manualPublishCorte.corte_id);
    marcarPublicado.mutate(
      { corteId: manualPublishCorte.corte_id, body: { youtube_url: youtubeUrl } },
      {
        onSuccess: (data) => {
          notify(data.mensagem || 'Video confirmado no YouTube.', { tone: 'success' });
          setManualPublishCorte(null);
          setManualYoutubeUrl('');
          atualizarDadosEstudio();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : 'Falha ao confirmar video no YouTube.', {
            tone: 'error',
          }),
        onSettled: () => setManualPublishCorteId(null),
      },
    );
  }

  /**
   * D-566: desfaz a marca de publicacao de UM destino.
   *
   * Nao apaga nada no YouTube nem no disco — so a memoria do app. Depois disso
   * o corte volta a aparecer no botao de enviar e na lista de massa, porque as
   * duas coisas sempre olharam para a marca que acabou de sair.
   */
  function confirmarLiberarPublicacao(destino: DestinoPublicacao) {
    if (!liberarCorte) return;
    liberarPublicacao.mutate(
      { corteId: liberarCorte.corte_id, body: { destino } },
      {
        onSuccess: (data) => {
          notify(data.mensagem, { tone: data.video_pronto ? 'success' : 'warning' });
          setLiberarCorte(null);
          atualizarDadosEstudio();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : 'Falha ao liberar a publicacao.', {
            tone: 'error',
          }),
      },
    );
  }

  function fecharLiberarPublicacao() {
    if (liberarPublicacao.isPending) return;
    setLiberarCorte(null);
  }

  const cortes = useMemo(
    () => mesclarCortesComExport(cortesQuery.data ?? [], exportStatus.data?.cortes ?? []),
    [cortesQuery.data, exportStatus.data],
  );

  // D-516: cada destino tem a SUA lista. Elas moram em `listasDePublicacao`,
  // fora do componente, porque foi compartilhando uma delas que o TikTok herdou
  // a regra do YouTube e os cortes sumiram da lista dele.
  const cortesProntos = useMemo(() => cortesParaYoutube(cortes), [cortes]);
  const cortesComVideo = useMemo(() => cortesParaTiktok(cortes), [cortes]);
  const totalPublicados = cortes.filter((c) => !!c.youtube_url_publicado).length;

  // Warmup: ao abrir o projeto, gera proxies/waveforms dos cortes em background
  // para que a timeline apareça na hora ao entrar em cada corte (F-062).
  const corteIds = useMemo(() => (cortesQuery.data ?? []).map((c) => c.id), [cortesQuery.data]);
  useWarmupWaveforms(corteIds);

  // Chips de estado do pipeline no header (DE-PARA §2).
  const falantes = useFalantes(id, true);
  const totalFalantes = falantes.data?.falantes ? Object.keys(falantes.data.falantes).length : 0;
  const baixado = projeto.data && !['pendente', 'baixando', 'erro'].includes(projeto.data.status);
  const transcrito =
    projeto.data && ['pronto', 'analisando', 'analisado'].includes(projeto.data.status);
  const avaliados = (cortesQuery.data ?? []).filter((c) => c.status !== 'proposto').length;
  const statusPorCorte = useMemo(
    () => new Map((cortesQuery.data ?? []).map((c) => [c.id, c])),
    [cortesQuery.data],
  );
  const publicacao = useMemo(
    () => avaliarProntidaoPublicacao(cortes, statusPorCorte),
    [cortes, statusPorCorte],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3">
        {/* Header do protótipo v3 §Workspace: thumb 132px + headline serif 24px
            + uma única linha mono discreta com a meta. As contagens são TEXTO
            colorido (acento / ok), não Badge — as caixas coloridas competiam
            com os chips de estado logo abaixo e com a barra de ações. */}
        <header className="flex flex-wrap items-start gap-4">
          {projeto.data?.youtube_url && (
            <img
              src={thumbnailUrl(projeto.data.youtube_url, 'mq') ?? undefined}
              alt=""
              loading="lazy"
              className="hidden w-[132px] flex-none self-start rounded-[10px] object-cover shadow-[shadow:var(--wb-shadow)] [aspect-ratio:16/9] sm:block"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-editorial text-[24px] font-medium leading-[1.15] text-[var(--wb-text)] [text-wrap:pretty]">
                {projeto.data?.titulo_live || (projeto.isLoading ? 'Carregando...' : 'Projeto')}
              </h1>
              {cortesQuery.isFetching && !cortesQuery.isLoading && (
                <Loader2 size={14} className="animate-spin text-[var(--wb-text-dim)]" />
              )}
            </div>
            {projeto.data && (
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 font-code text-[10.5px] font-semibold text-[var(--wb-text-mute)]">
                {projeto.data.canal_origem && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden>📺</span>
                    {projeto.data.canal_origem}
                  </span>
                )}
                {projeto.data.data_live && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden>🗓</span>
                    <time className="tabular-nums">{formatarDataLive(projeto.data.data_live)}</time>
                  </span>
                )}
                {projeto.data.duracao_segundos > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden>⏱</span>
                    <span className="tabular-nums">
                      {formatarDuracaoHMS(projeto.data.duracao_segundos)}
                    </span>
                  </span>
                )}
                {projeto.data.pontuacao_ranking > 0 && (
                  <VotoQualidadeLive
                    projetoId={id}
                    pontuacaoRanking={projeto.data.pontuacao_ranking}
                  />
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-bold text-[var(--wb-accent)]">{cortes.length} cortes</span>
                  <Tooltip label="Adicionar corte manualmente" side="bottom">
                    <button
                      type="button"
                      onClick={() => setAdicionarCorteOpen(true)}
                      aria-label="Adicionar corte manualmente"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
                    >
                      <Plus size={11} strokeWidth={2.4} aria-hidden />
                    </button>
                  </Tooltip>
                </span>
                {publicacao.total > 0 && (
                  <span
                    className={cn(
                      'font-bold',
                      publicacao.liberado
                        ? 'text-[var(--wb-ok-ink)]'
                        : 'text-[var(--wb-warn-ink)]',
                    )}
                  >
                    🚀 {publicacao.prontos}/{publicacao.total} prontos
                  </span>
                )}
                {totalPublicados > 0 && (
                  <span className="font-bold text-[var(--wb-ok-ink)]">
                    ▶ {totalPublicados} publicados
                  </span>
                )}
              </div>
            )}
            {projeto.data && (
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    'rounded-[6px] px-2.5 py-[3px] text-[10px] font-bold',
                    baixado
                      ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]'
                      : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)]',
                  )}
                >
                  {baixado ? '✓ baixado' : '⬇ download pendente'}
                </span>
                <span
                  className={cn(
                    'rounded-[6px] px-2.5 py-[3px] text-[10px] font-bold',
                    transcrito
                      ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]'
                      : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)]',
                  )}
                >
                  {transcrito ? '✓ transcrito' : '📝 transcrição pendente'}
                </span>
                {totalFalantes > 0 && (
                  <button
                    type="button"
                    onClick={() => setAnaliseOpen(true)}
                    title="Diarização de falantes (painel na Análise IA)"
                    className="rounded-[6px] bg-[var(--wb-ok-soft)] px-2.5 py-[3px] text-[10px] font-bold text-[var(--wb-ok)]"
                  >
                    ✓ diarizado · {totalFalantes} falante{totalFalantes > 1 ? 's' : ''}
                  </button>
                )}
                {cortes.length > 0 && (
                  <span className="rounded-[6px] bg-[var(--wb-accent-soft)] px-2.5 py-[3px] text-[10px] font-bold text-[var(--wb-accent)]">
                    ✂ {avaliados}/{cortes.length} avaliados
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Ações globais (DE-PARA-v3 §2) — dois grupos com hierarquia clara
            dentro de um painel: à esquerda o primário sólido + o secundário em
            outline; à direita, atrás do rótulo UTILITÁRIOS, um cluster inset
            visualmente recuado com os 4 ícones raros (cada um com `title`).
            Antes tudo dividia a mesma linha e o mesmo peso — não dava para ler
            o que era primário. */}
        <div className="flex flex-wrap items-center gap-2.5 rounded-[11px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3.5 py-2.5">
          {/* D-439: gate duro do lote. O `span` é o gatilho do tooltip porque o
              Button desabilitado tem `pointer-events-none` — sem ele o motivo do
              bloqueio nunca apareceria. O chip ao lado repete o estado em texto
              visível, que é o que resolve o "não dá para saber se está pronto". */}
          <Tooltip label={publicacao.detalhe} side="bottom">
            <span className="inline-flex">
              <Button onClick={() => setPublicarOpen(true)} disabled={!publicacao.liberado}>
                <Rocket size={16} />
                Publicar em massa
              </Button>
            </span>
          </Tooltip>
          {/* D-510: o TikTok ao lado do YouTube, porque publicar o horizontal é
              a mesma decisão em dois destinos. Sem o gate do lote: o TikTok não
              publica por API (envio manual), então nada aqui depende de TODOS
              os cortes estarem prontos — só dos que estiverem. */}
          <Button variant="outline" onClick={() => setTiktokOpen(true)}>
            <Send size={16} />
            TikTok
          </Button>
          {publicacao.total > 0 && (
            <span
              className={cn(
                'rounded-[6px] px-2.5 py-[3px] text-[10px] font-bold',
                publicacao.liberado
                  ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]'
                  : 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn-ink)]',
              )}
            >
              {publicacao.liberado ? '✓' : '⏳'} {publicacao.resumo}
            </span>
          )}
          <Button variant="outline" onClick={() => setAnaliseOpen(true)}>
            <Brain size={16} />
            Análise IA
          </Button>

          <div className="flex-1" />

          <span className="font-code text-[8.5px] font-bold uppercase tracking-[0.12em] text-[var(--wb-text-dim)]">
            Utilitários
          </span>
          {/* Só o CONTAINER tem borda/fundo — cada ícone é limpo, traço fino em
              --wb-text-mute, e só ganha fundo no hover. Antes cada botão tinha
              caixa e borda próprias, o que criava a fileira cinza pesada. */}
          <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-[3px]">
            {projeto.data?.youtube_url && (
              <Tooltip label="Abrir vídeo original no YouTube" side="bottom">
                <button
                  type="button"
                  className={cn(UTILITARIO_CLASS, 'text-[var(--wb-info)]')}
                  aria-label="Abrir no YouTube"
                  onClick={() =>
                    window.open(projeto.data?.youtube_url ?? '', '_blank', 'noopener,noreferrer')
                  }
                >
                  <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </Tooltip>
            )}
            <Tooltip
              label="Refazer transcrição — re-baixa as legendas no formato json3 (sem duplicacao do VTT) e re-sincroniza todos os cortes."
              side="bottom"
            >
              <button
                type="button"
                className={cn(UTILITARIO_CLASS, 'text-[var(--wb-accent)]')}
                aria-label="Refazer transcricao"
                onClick={dispararRefazerTranscricao}
                disabled={refazerTranscricao.isPending}
              >
                <RotateCw
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                  className={refazerTranscricao.isPending ? 'animate-spin' : undefined}
                />
              </button>
            </Tooltip>
            <Tooltip
              label="Auditar análise — ver por que a IA escolheu cada corte e o que foi descartado."
              side="bottom"
            >
              <button
                type="button"
                className={cn(UTILITARIO_CLASS, 'text-[var(--wb-violet)]')}
                aria-label="Auditar análise"
                onClick={() => setAuditoriaOpen(true)}
                disabled={cortes.length === 0}
              >
                <Search size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
            <MenuDeIa
              rotulo="Gerar trechos de todos os cortes"
              icone={Scissors}
              ocupado={analisarDesviosTodos.disparado}
              desabilitado={cortes.length === 0}
              onGerar={dispararAnalisarDesviosTodos}
            />
          </div>
        </div>

        {/* Progresso em tempo real (WebSocket) */}
        {progresso && (progresso.status === 'baixando' || progresso.status === 'transcrevendo') && (
          <div className="rounded-[var(--radius)] border border-info/30 bg-info/10 px-4 py-3 text-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-medium text-info">
                {progresso.status === 'baixando' ? '⬇️ Baixando vídeo' : '📝 Transcrevendo'}
              </span>
              {typeof progresso.progresso === 'number' && (
                <span className="font-mono tabular-nums text-xs text-info">
                  {progresso.progresso.toFixed(1)}%
                </span>
              )}
            </div>
            {typeof progresso.progresso === 'number' && (
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--wb-bg-panel)]">
                <div
                  className="h-full bg-info transition-[width] duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, progresso.progresso))}%` }}
                />
              </div>
            )}
          </div>
        )}

        {progresso?.status === 'erro' && (
          <div className="rounded-[var(--radius)] border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            <span className="font-medium">❌ Erro durante a ingestão:</span>{' '}
            <span className="opacity-90">{progresso.mensagem}</span>
          </div>
        )}

        {/* Erro */}
        {cortesQuery.isError && (
          <div className="flex items-start gap-3 rounded-[var(--radius)] border border-error/30 bg-error/10 px-4 py-3 text-sm text-[#fca5a5]">
            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-medium">Não foi possível carregar os cortes</p>
              <p className="text-xs opacity-80">{(cortesQuery.error as Error).message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => cortesQuery.refetch()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!cortesQuery.isLoading && cortes.length === 0 && !cortesQuery.isError && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-surface-1/50 px-6 py-16 text-center">
            <span aria-hidden className="text-4xl">
              🧠
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text-100">Nenhum corte gerado ainda</h2>
              <p className="mt-1 text-sm text-text-300">
                Rode a análise IA para sugerir cortes a partir da transcrição.
              </p>
            </div>
            <Button onClick={() => setAnaliseOpen(true)}>
              <Brain size={16} />
              Iniciar análise
            </Button>
          </div>
        )}

        {/* Grid de cortes compactos (design Workbench 1c §Workspace):
            tint semântico + borda esquerda, click abre a aba do editor;
            ações rápidas aparecem no hover. */}
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {cortesQuery.isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[74px] animate-pulse rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)]"
              />
            ))}
          {!cortesQuery.isLoading &&
            cortes.map((corte, idx) => (
              <CorteLinhaCompacta
                key={corte.corte_id}
                projetoId={id}
                status={corte}
                corteFull={statusPorCorte.get(corte.corte_id)}
                onUploadYoutube={() => publicarCorteIndividual(corte.corte_id)}
                uploadPending={uploadingCorteId === corte.corte_id}
                onMarcarPublicado={() => abrirMarcarPublicado(corte)}
                onLiberarPublicacao={() => setLiberarCorte(corte)}
                onMover={(delta) => moverCorteNaLista(corte.corte_id, delta)}
                podeSubir={idx > 0}
                podeDescer={idx < cortes.length - 1}
                reordenando={reordenar.isPending}
              />
            ))}
        </div>
      </div>

      <AnaliseIaModal
        open={analiseOpen}
        onClose={() => setAnaliseOpen(false)}
        projetoId={id}
        duracaoSegundos={projeto.data?.duracao_segundos ?? 0}
        totalCortesExistentes={cortes.length}
      />
      <AuditoriaAnaliseModal
        open={auditoriaOpen}
        onClose={() => setAuditoriaOpen(false)}
        projetoId={id}
      />
      <PublicarMassaModal
        open={publicarOpen}
        onClose={() => setPublicarOpen(false)}
        projetoId={id}
        cortesProntos={cortesProntos}
      />
      <PublicarTiktokModal
        open={tiktokOpen}
        onClose={() => setTiktokOpen(false)}
        projetoId={id}
        cortes={cortesComVideo}
      />
      <AdicionarCorteModal
        open={adicionarCorteOpen}
        onClose={() => setAdicionarCorteOpen(false)}
        projetoId={id}
        onCreated={(corte) => navigate(`/projetos/${id}/cortes/${corte.id}`)}
      />
      <Modal
        open={Boolean(manualPublishCorte)}
        onClose={fecharMarcarPublicado}
        title="Informar YouTube"
        description={manualPublishCorte ? `Corte #${manualPublishCorte.numero}` : undefined}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={fecharMarcarPublicado}
              disabled={marcarPublicado.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmarMarcarPublicado}
              disabled={marcarPublicado.isPending}
            >
              {marcarPublicado.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              Verificar e salvar
            </Button>
          </>
        }
      >
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-300">
            URL ou ID do video
          </span>
          <input
            value={manualYoutubeUrl}
            onChange={(event) => setManualYoutubeUrl(event.target.value)}
            placeholder="https://youtu.be/..."
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-3 text-sm text-text-100 outline-none focus:border-accent-500"
            autoFocus
          />
        </label>
      </Modal>
      <Modal
        open={Boolean(liberarCorte)}
        onClose={fecharLiberarPublicacao}
        title="Liberar publicação"
        description={liberarCorte ? `Corte #${liberarCorte.numero}` : undefined}
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={fecharLiberarPublicacao}
            disabled={liberarPublicacao.isPending}
          >
            Fechar
          </Button>
        }
      >
        <div className="grid gap-3">
          <p className="text-sm text-text-300">
            Use quando o vídeo saiu do ar no destino — apagado para reprocessar, por exemplo.
            Isto <strong className="text-text-100">não apaga nada</strong> na plataforma nem no
            disco: só desfaz a marca aqui, e o corte volta para a fila de publicação.
          </p>
          {(liberarCorte ? destinosPublicados(liberarCorte) : []).map((alvo) => (
            <div
              key={alvo.destino}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-100">{alvo.rotulo}</div>
                <div className="truncate text-xs text-text-300" title={alvo.detalhe}>
                  {alvo.detalhe}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => confirmarLiberarPublicacao(alvo.destino)}
                disabled={liberarPublicacao.isPending}
              >
                {liberarPublicacao.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RotateCcw size={16} />
                )}
                Liberar
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </TooltipProvider>
  );
}

// ─── Card de corte do Workspace (AUDITORIA §4.2, D-396) ───────────────
// Capa (thumbnail do corte, fallback gradiente) + badge #numero (topo-esq),
// badge de status (base-esq), duração (base-dir) e os 8 estágios do
// pipeline (DE-PARA-v2 §2: BRUTO·CENAS·GRADED·OVERLAYS·FINAL·YOUTUBE·
// THUMB·META) como pips compactos com tooltip. Rejeitado ganha opacity
// .72 + véu na capa; aprovado/fire/leitura ganham tint + borda esquerda
// (portado de CorteCard.tsx, tintDoCorte). Click abre a aba do editor.

/** Tint de fundo + borda esquerda por status do corte (portado de CorteCard.tsx). */
function tintDoCorte(status: Corte['status'] | undefined, isFire?: boolean, isLeitura?: boolean) {
  if (status === 'rejeitado') {
    return 'bg-[var(--wb-err-soft)] border-l-[3px] border-l-[var(--wb-err)]';
  }
  if (status === 'aprovado' || status === 'processado') {
    if (isFire) return 'bg-[var(--wb-fire-soft)] border-l-[3px] border-l-[var(--wb-fire)]';
    if (isLeitura) return 'bg-[var(--wb-leitura-soft)] border-l-[3px] border-l-[var(--wb-leitura)]';
    return 'bg-[var(--wb-ok-soft)] border-l-[3px] border-l-[var(--wb-ok)]';
  }
  return 'bg-[var(--wb-bg-panel)]';
}

function labelAuxiliar(s: StatusExportCorte, statusCorte: Corte['status'] | undefined): string {
  if (s.youtube_url_publicado) return 'publicado ▶';
  if (statusCorte === 'rejeitado') return 'rejeitado';
  if (s.pronto_publicar) return 'pronto p/ publicar 🚀';
  if (s.video_pronto) return 'revisar 👁';
  if (s.metadados_completos) return 'sem render';
  if (s.raw_pronto) return 'pós →';
  if (statusCorte && statusCorte !== 'proposto') return 'continuar ▶';
  return 'pendente';
}

const GRADIENTES_CAPA = [
  'linear-gradient(135deg, oklch(0.5 0.1 250), oklch(0.3 0.08 270))',
  'linear-gradient(135deg, oklch(0.52 0.12 30), oklch(0.32 0.1 20))',
  'linear-gradient(135deg, oklch(0.5 0.1 155), oklch(0.3 0.08 175))',
  'linear-gradient(135deg, oklch(0.5 0.1 320), oklch(0.3 0.08 300))',
];

function CorteLinhaCompacta({
  projetoId,
  status,
  corteFull,
  onUploadYoutube,
  uploadPending,
  onMarcarPublicado,
  onLiberarPublicacao,
  onMover,
  podeSubir,
  podeDescer,
  reordenando,
}: {
  projetoId: string;
  status: StatusExportCorte;
  corteFull?: Corte;
  onUploadYoutube: () => void;
  uploadPending: boolean;
  onMarcarPublicado: () => void;
  /** D-566: abre o diálogo que desfaz a marca de publicação de um destino. */
  onLiberarPublicacao: () => void;
  onMover: (delta: -1 | 1) => void;
  podeSubir: boolean;
  podeDescer: boolean;
  reordenando: boolean;
}) {
  const navigate = useNavigate();
  const abrirPasta = useAbrirPasta();
  const aprovado = corteFull
    ? ['aprovado', 'processado'].includes(corteFull.status)
    : status.pronto_publicar;
  const rejeitado = corteFull?.status === 'rejeitado';
  const publicado = Boolean(status.youtube_url_publicado);
  // D-566: qualquer marca de publicação (YouTube ou TikTok) tem volta.
  const temPublicacao = destinosPublicados(status).length > 0;
  const durSeg = corteFull ? Math.max(0, corteFull.fim_seg - corteFull.inicio_seg) : 0;
  const capa = resolveThumbUrl(projetoId, status.thumbnail_path);
  const irEditor = () => navigate(`/projetos/${projetoId}/cortes/${status.corte_id}`);

  const badgeStatus = publicado
    ? { texto: 'publicado', classe: 'bg-[var(--wb-info)] text-white' }
    : rejeitado
      ? { texto: 'rejeitado', classe: 'bg-[var(--wb-err)] text-white' }
      : aprovado
        ? corteFull?.is_fire
          ? { texto: '🔥 aprovado', classe: 'bg-[var(--wb-fire)] text-white' }
          : { texto: 'aprovado', classe: 'bg-[var(--wb-ok)] text-white' }
        : { texto: 'pendente', classe: 'bg-[var(--wb-pill-bg)] text-[var(--wb-text)]' };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir editor do corte ${status.numero}`}
      onClick={irEditor}
      onKeyDown={(e) => {
        if (e.key === 'Enter') irEditor();
      }}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-[10px] border border-[var(--wb-border)] transition-colors hover:border-[var(--wb-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        tintDoCorte(corteFull?.status, corteFull?.is_fire, corteFull?.is_leitura),
        rejeitado && 'opacity-[.72]',
      )}
    >
      {/* Capa 16:9 com badges sobrepostos */}
      <div
        className="relative aspect-video w-full bg-[var(--wb-bg-inset)]"
        style={
          capa ? undefined : { background: GRADIENTES_CAPA[status.numero % GRADIENTES_CAPA.length] }
        }
      >
        {capa && <img src={capa} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {rejeitado && <div className="absolute inset-0 bg-black/45" aria-hidden />}
        <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-black/55 px-1.5 py-0.5 font-code text-[9px] font-bold text-white">
          #{status.numero}
        </span>
        <span
          className={cn(
            'absolute bottom-1.5 left-1.5 rounded-[5px] px-1.5 py-0.5 text-[9px] font-bold',
            badgeStatus.classe,
          )}
        >
          {badgeStatus.texto}
        </span>
        {durSeg > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-black/55 px-1.5 py-0.5 font-code text-[9px] font-bold tabular-nums text-white">
            {formatarDuracaoHMS(durSeg)}
          </span>
        )}
        {/* Ações rápidas em hover */}
        <span
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={() => onMover(-1)}
            disabled={!podeSubir || reordenando}
            aria-label={`Mover corte ${status.numero} para cima`}
            className="rounded bg-black/60 px-1 text-[10px] text-white disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={!podeDescer || reordenando}
            aria-label={`Mover corte ${status.numero} para baixo`}
            className="rounded bg-black/60 px-1 text-[10px] text-white disabled:opacity-30"
          >
            ↓
          </button>
          {status.pronto_publicar && !publicado && (
            <button
              type="button"
              onClick={onUploadYoutube}
              disabled={uploadPending}
              aria-label="Enviar video individual para o YouTube"
              title="Enviar para o YouTube"
              className="rounded bg-black/60 px-1 text-[10px] text-white disabled:opacity-40"
            >
              ☁
            </button>
          )}
          {!publicado && (
            <button
              type="button"
              onClick={onMarcarPublicado}
              aria-label="Informar URL ja publicada no YouTube"
              title="Informar URL do YouTube"
              className="rounded bg-black/60 px-1 text-[10px] text-white"
            >
              ▶
            </button>
          )}
          {temPublicacao && (
            <button
              type="button"
              onClick={onLiberarPublicacao}
              aria-label="Liberar publicacao para subir de novo"
              title="Liberar publicação (subir de novo)"
              className="rounded bg-black/60 px-1 text-[10px] text-white"
            >
              ↺
            </button>
          )}
          <button
            type="button"
            onClick={() => abrirPasta.mutate(status.corte_id)}
            disabled={abrirPasta.isPending}
            aria-label="Abrir pasta"
            title="Abrir pasta"
            className="rounded bg-black/60 px-1 text-[10px] text-white disabled:opacity-40"
          >
            📁
          </button>
        </span>
      </div>

      <div className="px-2 py-1.5">
        <div
          className={cn(
            // DE-PARA-v3 (densidade): 2 linhas antes de reticências — o
            // `truncate` cortava o título cedo mesmo sobrando espaço.
            'line-clamp-2 text-[11px] leading-[1.3]',
            aprovado || publicado
              ? 'font-bold text-[var(--wb-text)]'
              : 'font-semibold text-[var(--wb-text-mute)]',
          )}
          title={status.titulo ?? undefined}
        >
          {status.titulo || `Corte #${status.numero}`}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {/* DE-PARA-v3 §2: tira compacta de 8 pips coloridos por estado
              (o emoji em círculo de 15px pesava demais no card estreito e a
              cor não dizia em que estágio o corte parou). O rótulo-resumo
              ao lado continua sendo `labelAuxiliar`. */}
          <StatusPipStrip corte={status} statusCorte={corteFull?.status} />
          <span className="truncate text-[9.5px] font-semibold text-[var(--wb-text-mute)]">
            {labelAuxiliar(status, corteFull?.status)}
          </span>
        </div>
      </div>
    </div>
  );
}
