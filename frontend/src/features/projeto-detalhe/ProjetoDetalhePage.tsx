import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCcw,
  Rocket,
} from 'lucide-react';
import { AdicionarCorteModal } from '@/features/editor/AdicionarCorteModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import {
  useExportStatus,
  useMarcarPublicadoYouTube,
  useProjeto,
  useProjetoProgressoWS,
  useRefazerTranscricao,
  useUploadYouTube,
} from '@/hooks/useProjetoDetalhe';
import { moverCorte, useCortesProjeto, useReordenarCortes } from '@/hooks/useEditor';
import { useWarmupWaveforms } from '@/hooks/useWarmupWaveforms';
import { formatarDataLive, formatarDuracaoHMS } from '@/lib/utils';
import type { StatusExportCorte } from '@/types/models';
import { CorteCard } from './CorteCard';
import { AnaliseIaModal } from './AnaliseIaModal';
import { AuditoriaAnaliseModal } from './AuditoriaAnaliseModal';
import { PublicarMassaModal } from './PublicarMassaModal';

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
  const [adicionarCorteOpen, setAdicionarCorteOpen] = useState(false);
  const [uploadingCorteId, setUploadingCorteId] = useState<string | null>(null);
  const [manualPublishCorte, setManualPublishCorte] = useState<StatusExportCorte | null>(null);
  const [manualYoutubeUrl, setManualYoutubeUrl] = useState('');
  const [manualPublishCorteId, setManualPublishCorteId] = useState<string | null>(null);

  const { notify } = useToast();
  const refazerTranscricao = useRefazerTranscricao(id);
  const uploadYoutube = useUploadYouTube();
  const marcarPublicado = useMarcarPublicadoYouTube();
  const reordenar = useReordenarCortes(id);

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

  // Mescla: todos os cortes (incluindo 'proposto') enriquecidos com dados de export quando disponíveis
  const cortes = useMemo((): StatusExportCorte[] => {
    const all = cortesQuery.data ?? [];
    const statusMap = new Map((exportStatus.data?.cortes ?? []).map((c) => [c.corte_id, c]));
    return all.map((c) => {
      const s = statusMap.get(c.id);
      if (s) return s;
      const videoPronto = !!(c.is_pos_producao === 1);
      return {
        corte_id: c.id,
        numero: c.numero,
        titulo: c.titulo_proposto,
        raw_pronto: !!c.arquivo_clip_path,
        grade_pronta: videoPronto,
        overlays_prontos: videoPronto,
        video_pronto: videoPronto,
        thumbnail_pronta: false,
        metadados_completos: false,
        pronto_publicar: false,
        youtube_url_publicado: c.youtube_url_publicado || undefined,
        youtube_scheduled_at: c.youtube_scheduled_at || undefined,
      };
    });
  }, [cortesQuery.data, exportStatus.data]);

  const cortesProntos = useMemo(
    () => cortes.filter((c) => c.pronto_publicar && !c.youtube_url_publicado),
    [cortes],
  );
  const totalPublicados = cortes.filter((c) => !!c.youtube_url_publicado).length;

  // Warmup: ao abrir o projeto, gera proxies/waveforms dos cortes em background
  // para que a timeline apareça na hora ao entrar em cada corte (F-062).
  const corteIds = useMemo(() => (cortesQuery.data ?? []).map((c) => c.id), [cortesQuery.data]);
  useWarmupWaveforms(corteIds);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-6 py-6">
        {/* Breadcrumb */}
        <Link
          to="/projetos"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-text-400 hover:text-text-200"
        >
          <ArrowLeft size={14} /> Projetos
        </Link>

        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="line-clamp-2 max-w-3xl text-2xl font-medium tracking-tight text-text-100">
                <span aria-hidden className="mr-1.5">
                  🎬
                </span>
                {projeto.data?.titulo_live || (projeto.isLoading ? 'Carregando...' : 'Projeto')}
              </h1>
              {cortesQuery.isFetching && !cortesQuery.isLoading && (
                <Loader2 size={14} className="animate-spin text-text-400" />
              )}
            </div>
            {projeto.data && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {projeto.data.canal_origem && (
                  <span className="flex items-center gap-1 text-fuchsia-300/90">
                    <span aria-hidden>📺</span>
                    {projeto.data.canal_origem}
                  </span>
                )}
                {projeto.data.data_live && (
                  <span className="flex items-center gap-1 text-amber-300/90">
                    <span aria-hidden>🗓️</span>
                    <time className="font-mono tabular-nums">
                      {formatarDataLive(projeto.data.data_live)}
                    </time>
                  </span>
                )}
                {projeto.data.duracao_segundos > 0 && (
                  <span className="flex items-center gap-1 text-amber-300/90">
                    <span aria-hidden>⏱️</span>
                    <span className="font-mono tabular-nums">
                      {formatarDuracaoHMS(projeto.data.duracao_segundos)}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Badge variant="accent">{cortes.length} cortes</Badge>
                  <Tooltip label="Adicionar corte manualmente" side="bottom">
                    <button
                      type="button"
                      onClick={() => setAdicionarCorteOpen(true)}
                      aria-label="Adicionar corte manualmente"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--border)] text-text-300 transition-colors hover:border-[var(--wb-text-dim)] hover:bg-bg-800 hover:text-text-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    >
                      <Plus size={12} strokeWidth={2.4} aria-hidden />
                    </button>
                  </Tooltip>
                </span>
                {cortesProntos.length > 0 && (
                  <Badge variant="success">🚀 {cortesProntos.length} prontos</Badge>
                )}
                {totalPublicados > 0 && (
                  <Badge variant="info">▶️ {totalPublicados} publicados</Badge>
                )}
              </div>
            )}
          </div>

          {/* Ações globais */}
          <div className="flex flex-wrap items-center gap-1.5">
            {projeto.data?.youtube_url && (
              <Tooltip label="Abrir vídeo original no YouTube" side="bottom">
                <Button asChild variant="ghost">
                  <a href={projeto.data.youtube_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} />
                    Abrir no YouTube
                  </a>
                </Button>
              </Tooltip>
            )}
            <Tooltip
              label="Re-baixa as legendas no formato json3 (sem duplicacao do VTT) e re-sincroniza todos os cortes."
              side="bottom"
            >
              <Button
                variant="outline"
                onClick={dispararRefazerTranscricao}
                disabled={refazerTranscricao.isPending}
              >
                {refazerTranscricao.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCcw size={16} />
                )}
                Refazer transcricao
              </Button>
            </Tooltip>
            <Button variant="outline" onClick={() => setAnaliseOpen(true)}>
              <Brain size={16} />
              Análise IA
            </Button>
            <Tooltip
              label="Ver por que a IA escolheu cada corte e o que foi descartado."
              side="bottom"
            >
              <Button
                variant="outline"
                onClick={() => setAuditoriaOpen(true)}
                disabled={cortes.length === 0}
              >
                <ClipboardCheck size={16} />
                Auditar análise
              </Button>
            </Tooltip>
            <Button onClick={() => setPublicarOpen(true)} disabled={cortesProntos.length === 0}>
              <Rocket size={16} />
              Publicar em massa
            </Button>
          </div>
        </header>

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

        {/* Grid de cortes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cortesQuery.isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex aspect-[4/3] flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-surface-1"
              >
                <div className="aspect-video w-full animate-pulse bg-bg-800" />
                <div className="flex-1 space-y-2 p-3">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-bg-800" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-bg-800" />
                </div>
              </div>
            ))}
          {!cortesQuery.isLoading &&
            cortes.map((corte, idx) => (
              <CorteCard
                key={corte.corte_id}
                projetoId={id}
                corte={corte}
                onUploadYoutube={() => publicarCorteIndividual(corte.corte_id)}
                uploadYoutubePending={uploadingCorteId === corte.corte_id}
                onMarcarPublicado={() => abrirMarcarPublicado(corte)}
                marcarPublicadoPending={manualPublishCorteId === corte.corte_id}
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
    </TooltipProvider>
  );
}
