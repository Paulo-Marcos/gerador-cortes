import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Brain,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCcw,
  Rocket,
  Scissors,
} from 'lucide-react';
import { AdicionarCorteModal } from '@/features/editor/AdicionarCorteModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import {
  useAbrirPasta,
  useAnalisarDesviosTodos,
  useExportStatus,
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
import type { Corte, StatusExportCorte } from '@/types/models';
import { AnaliseIaModal } from './AnaliseIaModal';
import { AuditoriaAnaliseModal } from './AuditoriaAnaliseModal';
import { PublicarMassaModal } from './PublicarMassaModal';
import { VotoQualidadeLive } from './VotoQualidadeLive';

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
  const [, setManualPublishCorteId] = useState<string | null>(null);

  const { notify } = useToast();
  const refazerTranscricao = useRefazerTranscricao(id);
  const uploadYoutube = useUploadYouTube();
  const marcarPublicado = useMarcarPublicadoYouTube();
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

  function dispararAnalisarDesviosTodos() {
    if (
      !confirm(
        'Gerar trechos a remover (IA) para TODOS os cortes deste projeto?\n\n' +
          'A operação roda em segundo plano, corte a corte (pode levar minutos) — ' +
          'os desvios encontrados vão aparecendo aos poucos. Os trechos já marcados ' +
          'NÃO são removidos: esta ação só ACRESCENTA.',
      )
    )
      return;
    analisarDesviosTodos.disparar();
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

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3">
        {/* Header compacto (design Workbench 1c §Workspace: thumb 120px +
            título 14px/800 + meta + chips de estado). */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          {projeto.data?.youtube_url && (
            <img
              src={thumbnailUrl(projeto.data.youtube_url, 'mq') ?? undefined}
              alt=""
              loading="lazy"
              className="hidden w-[120px] flex-none self-start rounded-[9px] object-cover [aspect-ratio:16/9] sm:block"
            />
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="line-clamp-2 max-w-3xl text-[14px] font-extrabold text-[var(--wb-text)]">
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
                {projeto.data.pontuacao_ranking > 0 && (
                  <VotoQualidadeLive
                    projetoId={id}
                    pontuacaoRanking={projeto.data.pontuacao_ranking}
                  />
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
            {projeto.data && (
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    'rounded-[5px] px-2 py-0.5 text-[9.5px] font-bold',
                    baixado
                      ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
                      : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)]',
                  )}
                >
                  {baixado ? '✓ baixado' : '⬇ download pendente'}
                </span>
                <span
                  className={cn(
                    'rounded-[5px] px-2 py-0.5 text-[9.5px] font-bold',
                    transcrito
                      ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
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
                    className="rounded-[5px] bg-[var(--wb-ok-soft)] px-2 py-0.5 text-[9.5px] font-bold text-[var(--wb-ok)]"
                  >
                    ✓ diarizado · {totalFalantes} falante{totalFalantes > 1 ? 's' : ''}
                  </button>
                )}
                {cortes.length > 0 && (
                  <span className="rounded-[5px] bg-[var(--wb-accent-soft)] px-2 py-0.5 text-[9.5px] font-bold text-[var(--wb-accent)]">
                    ✂ {avaliados}/{cortes.length} avaliados
                  </span>
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
            <Tooltip
              label="Gera trechos a remover (IA) para todos os cortes do projeto. Roda em segundo plano, corte a corte, e só acrescenta aos já marcados."
              side="bottom"
            >
              <Button
                variant="outline"
                onClick={dispararAnalisarDesviosTodos}
                disabled={cortes.length === 0 || analisarDesviosTodos.disparado}
              >
                {analisarDesviosTodos.disparado ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Scissors size={16} />
                )}
                Gerar trechos (todos os cortes)
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

// ─── Card compacto do Workspace (design Workbench 1c §2, D-395) ────────
// "07 · Título" + duração + linha de status semântica; tint de fundo com
// borda esquerda 3px; click abre a aba do editor no corte. Ações rápidas
// (mover/metadados via editor, YouTube, pasta) aparecem no hover.

const TINT_COMPACTO: Record<string, string> = {
  rejeitado: 'bg-[var(--wb-err-soft)] border-l-[3px] border-l-[var(--wb-err)]',
  fire: 'bg-[var(--wb-fire-soft)] border-l-[3px] border-l-[var(--wb-fire)]',
  leitura: 'bg-[var(--wb-leitura-soft)] border-l-[3px] border-l-[var(--wb-leitura)]',
  aprovado: 'bg-[var(--wb-ok-soft)] border-l-[3px] border-l-[var(--wb-ok)]',
};

function CorteLinhaCompacta({
  projetoId,
  status,
  corteFull,
  onUploadYoutube,
  uploadPending,
  onMarcarPublicado,
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
  onMover: (delta: -1 | 1) => void;
  podeSubir: boolean;
  podeDescer: boolean;
  reordenando: boolean;
}) {
  const navigate = useNavigate();
  const abrirPasta = useAbrirPasta();
  const aprovado = corteFull
    ? ['aprovado', 'editado', 'processado'].includes(corteFull.status)
    : status.pronto_publicar;
  const publicado = Boolean(status.youtube_url_publicado);
  const tintKey =
    corteFull?.status === 'rejeitado'
      ? 'rejeitado'
      : aprovado
        ? corteFull?.is_fire
          ? 'fire'
          : corteFull?.is_leitura
            ? 'leitura'
            : 'aprovado'
        : null;
  const durSeg = corteFull ? Math.max(0, corteFull.fim_seg - corteFull.inicio_seg) : 0;

  const linhaStatus = publicado
    ? 'publicado no YouTube ▶'
    : corteFull?.status === 'rejeitado'
      ? 'rejeitado'
      : aprovado
        ? status.video_pronto
          ? `aprovado${corteFull?.is_fire ? ' 🔥' : ''} · pós ✓`
          : status.metadados_completos
            ? `aprovado${corteFull?.is_fire ? ' 🔥' : ''} · sem render`
            : `aprovado${corteFull?.is_fire ? ' 🔥' : ''} · sem metadados`
        : 'pendente';

  const corStatus = publicado
    ? 'text-[var(--wb-info)]'
    : corteFull?.status === 'rejeitado'
      ? 'text-[var(--wb-text-mute)]'
      : aprovado
        ? 'text-[var(--wb-ok)]'
        : 'text-[var(--wb-text-dim)]';

  const irEditor = () => navigate(`/projetos/${projetoId}/cortes/${status.corte_id}`);

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
        'group cursor-pointer rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5 transition-colors hover:border-[var(--wb-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        tintKey && TINT_COMPACTO[tintKey],
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'truncate text-[11px]',
            aprovado || publicado
              ? 'font-bold text-[var(--wb-text)]'
              : 'font-semibold text-[var(--wb-text-mute)]',
          )}
          title={status.titulo}
        >
          {String(status.numero).padStart(2, '0')} · {status.titulo || `Corte #${status.numero}`}
        </span>
        {durSeg > 0 && (
          <span className="font-code text-[9px] font-semibold text-[var(--wb-text-dim)]">
            {formatarDuracaoHMS(durSeg)}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={cn('text-[9.5px] font-semibold', corStatus)}>{linhaStatus}</span>
        <span
          onClick={(e) => e.stopPropagation()}
          className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={() => onMover(-1)}
            disabled={!podeSubir || reordenando}
            aria-label={`Mover corte ${status.numero} para cima`}
            className="rounded px-1 text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={!podeDescer || reordenando}
            aria-label={`Mover corte ${status.numero} para baixo`}
            className="rounded px-1 text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => navigate(`/projetos/${projetoId}/metadados`)}
            aria-label="Abrir metadados"
            title="Metadados"
            className="rounded px-1 text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
          >
            🏷
          </button>
          {status.pronto_publicar && !publicado && (
            <button
              type="button"
              onClick={onUploadYoutube}
              disabled={uploadPending}
              aria-label="Enviar video individual para o YouTube"
              title="Enviar para o YouTube"
              className="rounded px-1 text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:opacity-40"
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
              className="rounded px-1 text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
            >
              ▶
            </button>
          )}
          <button
            type="button"
            onClick={() => abrirPasta.mutate(status.corte_id)}
            disabled={abrirPasta.isPending}
            aria-label="Abrir pasta"
            title="Abrir pasta"
            className="rounded px-1 text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:opacity-40"
          >
            📁
          </button>
        </span>
      </div>
    </div>
  );
}
