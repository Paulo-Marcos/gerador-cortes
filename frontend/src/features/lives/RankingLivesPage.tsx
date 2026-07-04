import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  Eye,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { RankingLive, RankingLivesResponse } from '@/types/models';

function formatPublishedAt(iso: string) {
  if (!iso) return 'sem data';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(iso: string) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso || 'sem duracao';
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatRelative(iso: string) {
  if (!iso) return 'nunca';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const horas = Math.max(0, Math.round(diffMs / 3_600_000));
    if (horas < 1) return 'agora há pouco';
    if (horas < 24) return `há ${horas}h`;
    return `há ${Math.round(horas / 24)}d`;
  } catch {
    return iso;
  }
}

function hueFromId(id: string) {
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

const COMPONENTE_LABEL: Record<string, string> = {
  views: 'Audiência',
  likes_por_view: 'Likes (taxa)',
  comentarios_por_view: 'Comentários (taxa)',
  sentimento: 'Tom do público',
  recencia: 'Recência',
};

export function RankingLivesPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const rankingKey = ['ranking-lives'] as const;
  const rankingQuery = useQuery({
    queryKey: rankingKey,
    queryFn: () => api.listarRankingLives(false),
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.refreshRankingLives(),
    onSuccess: (data) => {
      queryClient.setQueryData<RankingLivesResponse>(rankingKey, data);
      notify('Ranking atualizado.', { tone: 'success' });
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : 'Falha ao atualizar ranking.', {
        tone: 'error',
      });
    },
  });

  const rejeitarMutation = useMutation({
    mutationFn: (videoId: string) => api.rejeitarCandidata(videoId),
    onSuccess: (_data, videoId) => {
      queryClient.setQueryData<RankingLivesResponse>(rankingKey, (current) =>
        current
          ? { ...current, lives: current.lives.filter((l) => l.video_id !== videoId) }
          : current,
      );
      notify('Live rejeitada — a próxima da fila assume a vaga ao atualizar.', {
        tone: 'info',
      });
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : 'Falha ao rejeitar.', { tone: 'error' });
    },
  });

  const baixarMutation = useMutation({
    mutationFn: (videoId: string) => api.enfileirarCandidata(videoId),
    onSuccess: (data, videoId) => {
      queryClient.setQueryData<RankingLivesResponse>(rankingKey, (current) =>
        current
          ? { ...current, lives: current.lives.filter((l) => l.video_id !== videoId) }
          : current,
      );
      notify(
        data.ja_existia
          ? 'Já havia projeto para essa live; abrindo.'
          : 'Download iniciado — vai aparecer em Projetos.',
        { tone: 'success' },
      );
      navigate(`/projetos/${data.projeto_id}`);
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : 'Falha ao baixar.', { tone: 'error' });
    },
  });

  const lives = useMemo(() => rankingQuery.data?.lives ?? [], [rankingQuery.data]);
  const atualizadoEm = rankingQuery.data?.atualizado_em ?? '';
  const janelaMeses = rankingQuery.data?.janela_meses;

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-7 py-5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]">
            <Trophy size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to="/projetos"
              className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              <ArrowLeft size={14} aria-hidden />
              Voltar
            </Link>
            <div className="flex items-baseline gap-3">
              <h1 className="font-editorial text-[48px] font-medium leading-[0.96] tracking-[-0.01em] text-[var(--wb-text)]">
                Ranking de lives
              </h1>
              <span className="font-code text-[12px] uppercase tracking-[0.09em] text-[var(--wb-text-dim)]">
                top {lives.length}
              </span>
            </div>
            <p className="mt-2 text-[15px] text-[var(--wb-text-mute)]">
              Pontuação baseada em audiência, engajamento, tom dos comentários e recência. Lives já
              baixadas ou rejeitadas não aparecem aqui.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw aria-hidden />
            )}
            Atualizar ranking
          </Button>
        </div>
      </header>

      <main className="grid flex-1 content-start gap-4 overflow-auto p-5">
        <section className="flex flex-wrap items-center gap-3 text-xs text-[var(--wb-text-mute)]">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} aria-hidden />
            Atualizado {formatRelative(atualizadoEm)}
          </span>
          {janelaMeses && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={12} aria-hidden />
              Janela de {janelaMeses} {janelaMeses === 1 ? 'mês' : 'meses'}
            </span>
          )}
        </section>

        {rankingQuery.isError && (
          <div className="rounded-[var(--radius)] border border-error/30 bg-error/10 p-4 text-sm text-error">
            {rankingQuery.error instanceof Error
              ? rankingQuery.error.message
              : 'Não foi possível carregar o ranking.'}
          </div>
        )}

        {(rankingQuery.isLoading || refreshMutation.isPending) && lives.length === 0 && (
          <div className="grid min-h-[240px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
            <div className="flex items-center gap-2 text-[var(--wb-text-mute)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Gerando ranking (busca + sentimento via Claude). Pode levar alguns minutos na primeira
              vez.
            </div>
          </div>
        )}

        {!rankingQuery.isLoading && lives.length === 0 && !rankingQuery.isError && (
          <div className="grid min-h-[240px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
            <div>
              <Trophy size={34} className="mx-auto mb-3 text-[var(--wb-text-dim)]" aria-hidden />
              <p className="font-editorial text-3xl font-medium">Nenhuma candidata pendente</p>
              <p className="mt-1 text-sm text-[var(--wb-text-mute)]">
                Clique em "Atualizar ranking" para buscar lives recentes do canal-fonte.
              </p>
            </div>
          </div>
        )}

        <ol className="grid gap-3">
          {lives.map((live, idx) => (
            <RankingRow
              key={live.video_id}
              live={live}
              posicao={idx + 1}
              onBaixar={() => baixarMutation.mutate(live.video_id)}
              onRejeitar={() => rejeitarMutation.mutate(live.video_id)}
              baixando={baixarMutation.isPending && baixarMutation.variables === live.video_id}
              rejeitando={
                rejeitarMutation.isPending && rejeitarMutation.variables === live.video_id
              }
            />
          ))}
        </ol>
      </main>
    </div>
  );
}

interface RowProps {
  live: RankingLive;
  posicao: number;
  onBaixar: () => void;
  onRejeitar: () => void;
  baixando: boolean;
  rejeitando: boolean;
}

function RankingRow({ live, posicao, onBaixar, onRejeitar, baixando, rejeitando }: RowProps) {
  const score = Math.round(live.pontuacao_total);
  const breakdown = Object.entries(live.componentes_pontuacao)
    .map(([k, v]) => `${COMPONENTE_LABEL[k] ?? k}: ${Math.round(v)}`)
    .join(' · ');

  return (
    <li
      className={cn(
        'grid items-stretch gap-3 rounded-[var(--radius-lg)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-3 shadow-[var(--wb-shadow)] transition-colors',
        'md:grid-cols-[56px_146px_minmax(0,1fr)_220px]',
      )}
    >
      <div className="flex flex-col items-center justify-center gap-1">
        <span className="font-editorial text-3xl leading-none text-[var(--wb-text)]">
          {posicao}
        </span>
        <span className="font-code text-[10px] uppercase tracking-widest text-[var(--wb-text-dim)]">
          rank
        </span>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)]">
        {live.thumbnail_url ? (
          <img
            src={live.thumbnail_url}
            alt=""
            className="aspect-video h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <ThumbnailPlaceholder hue={hueFromId(live.video_id)} />
        )}
      </div>

      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-base font-extrabold leading-tight text-[var(--wb-text)]">
            {live.titulo}
          </h3>
          <a
            href={live.youtube_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 text-xs font-bold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
          >
            <ExternalLink size={12} aria-hidden />
            Ver
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--wb-text-dim)]">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} aria-hidden />
            {formatPublishedAt(live.data_publicacao)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden />
            {formatDuration(live.duracao_iso)}
          </span>
          <Tooltip label={`${live.views.toLocaleString('pt-BR')} views`} side="top">
            <span className="inline-flex items-center gap-1">
              <Eye size={12} aria-hidden />
              {formatNumber(live.views)}
            </span>
          </Tooltip>
          <Tooltip label={`${live.likes.toLocaleString('pt-BR')} likes`} side="top">
            <span className="inline-flex items-center gap-1">
              <Heart size={12} aria-hidden />
              {formatNumber(live.likes)}
            </span>
          </Tooltip>
          <Tooltip label={`${live.comentarios.toLocaleString('pt-BR')} comentários`} side="top">
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={12} aria-hidden />
              {formatNumber(live.comentarios)}
            </span>
          </Tooltip>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--wb-border)] px-2 py-0.5 text-[11px]">
            tom {live.sentimento_score.toFixed(1)}/10
          </span>
        </div>

        {live.sentimento_destaques.length > 0 && (
          <ul className="grid gap-1 text-[12px] text-[var(--wb-text-mute)]">
            {live.sentimento_destaques.slice(0, 2).map((destaque, i) => (
              <li
                key={i}
                className="border-l-2 border-[var(--wb-accent-soft)] pl-2 italic line-clamp-1"
              >
                "{destaque}"
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col items-stretch justify-between gap-3">
        <Tooltip label={breakdown || 'Composição da pontuação'} side="left">
          <div className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="font-code text-[10px] uppercase tracking-widest text-[var(--wb-text-dim)]">
                Pontuação
              </span>
              <span className="font-editorial text-2xl leading-none text-[var(--wb-text)]">
                {score}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--wb-border)]">
              <div
                className="h-full bg-[var(--wb-accent)]"
                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              />
            </div>
          </div>
        </Tooltip>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRejeitar}
            disabled={rejeitando || baixando}
            className="flex-1"
          >
            {rejeitando ? <Loader2 className="animate-spin" /> : <X aria-hidden />}
            Rejeitar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onBaixar}
            disabled={baixando || rejeitando}
            className="flex-1"
          >
            {baixando ? <Loader2 className="animate-spin" /> : <Download aria-hidden />}
            Baixar
          </Button>
        </div>
      </div>
    </li>
  );
}
