import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AtSign,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  Radio,
  Search,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { YoutubeLive, YoutubeLivesResponse } from '@/types/models';

const DEFAULT_AFTER_DATE = '2026-05-01';

function toApiDate(date: string) {
  return date.replaceAll('-', '');
}

function formatPublishedAt(iso: string) {
  if (!iso) return 'sem data';
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
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

function hueFromId(id: string) {
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

export function LiveSearchPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [afterDate, setAfterDate] = useState(DEFAULT_AFTER_DATE);
  const [channel, setChannel] = useState(import.meta.env.VITE_CANAL_HANDLE ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useState({
    afterDate: toApiDate(DEFAULT_AFTER_DATE),
    max: 25,
  });

  const livesKey = ['youtube-lives', searchParams] as const;
  const livesQuery = useQuery({
    queryKey: livesKey,
    queryFn: () => api.listarLivesCanal(searchParams.afterDate, searchParams.max),
  });

  const lives = useMemo(() => livesQuery.data?.lives ?? [], [livesQuery.data]);
  const selectedLives = useMemo(
    () => lives.filter((live) => selectedIds.has(live.video_id)),
    [lives, selectedIds],
  );

  useEffect(() => {
    if (!livesQuery.data) return;
    setSelectedIds(
      new Set(
        livesQuery.data.lives.filter((live) => !live.ja_baixado).map((live) => live.video_id),
      ),
    );
  }, [livesQuery.data]);

  const enqueueMutation = useMutation({
    mutationFn: (ids: string[]) => api.enfileirarDownloads(ids, channel),
    onSuccess: (res) => {
      const createdIds = new Set(res.criados.map((item) => item.video_id));
      queryClient.setQueryData<YoutubeLivesResponse>(livesKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          lives: current.lives.map((live) => ({
            ...live,
            ja_baixado: live.ja_baixado || createdIds.has(live.video_id),
          })),
        };
      });
      setSelectedIds(new Set());
      notify(`${res.criados.length} projeto(s) criado(s) e pipeline iniciado.`, {
        tone: res.criados.length > 0 ? 'success' : 'info',
      });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao enfileirar lives.', {
        tone: 'error',
      });
    },
  });

  const searchLives = () => {
    const next = { afterDate: toApiDate(afterDate), max: 25 };
    setSearchParams(next);
    if (next.afterDate === searchParams.afterDate) void livesQuery.refetch();
  };

  const toggleLive = (live: YoutubeLive) => {
    if (live.ja_baixado) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(live.video_id)) next.delete(live.video_id);
      else next.add(live.video_id);
      return next;
    });
  };

  const selectNotDownloaded = () => {
    setSelectedIds(new Set(lives.filter((live) => !live.ja_baixado).map((live) => live.video_id)));
    notify('Lives nao baixadas selecionadas.', { tone: 'info' });
  };

  const processSelected = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    enqueueMutation.mutate(ids);
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-7 py-5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]">
            <Radio size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <Link
              to="/projetos"
              className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              <ArrowLeft size={14} aria-hidden />
              Voltar
            </Link>
            <h1 className="font-editorial text-[48px] font-medium leading-[0.96] tracking-[-0.01em] text-[var(--wb-text)]">
              Buscar novas lives
            </h1>
            <p className="mt-2 text-[15px] text-[var(--wb-text-mute)]">
              Encontre lives recentes, selecione as nao baixadas e inicie o pipeline.
            </p>
          </div>
        </div>
      </header>

      <main className="grid flex-1 content-start gap-4 overflow-auto p-5">
        <section className="grid items-end gap-3 rounded-[var(--radius-lg)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-4 shadow-[var(--wb-shadow)] lg:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_170px]">
          <label className="grid gap-2">
            <span className="font-code text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--wb-text-dim)]">
              Lives apos a data
            </span>
            <span className="flex h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3">
              <Calendar size={15} className="text-[var(--wb-text-dim)]" aria-hidden />
              <input
                value={afterDate}
                onChange={(event) => setAfterDate(event.target.value)}
                type="date"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--wb-text)] outline-none"
              />
            </span>
          </label>
          <label className="grid gap-2">
            <span className="font-code text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--wb-text-dim)]">
              Canal de origem
            </span>
            <span className="flex h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3">
              <AtSign size={15} className="text-[var(--wb-text-dim)]" aria-hidden />
              <input
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--wb-text)] outline-none"
              />
            </span>
          </label>
          <Button type="button" onClick={searchLives} disabled={livesQuery.isFetching}>
            {livesQuery.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
            Buscar lives
          </Button>
        </section>

        {selectedLives.length > 0 && (
          <section className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--wb-accent)] bg-[color-mix(in_oklch,var(--wb-accent)_6%,var(--wb-bg-card))] p-3.5 shadow-[0_14px_36px_rgba(20,15,10,0.10)] md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] bg-[var(--wb-accent)] text-white">
                  <Radio size={15} aria-hidden />
                </span>
                <strong className="text-[var(--wb-accent)]">
                  {selectedLives.length} live(s) selecionada(s)
                </strong>
                <span className="text-sm text-[var(--wb-text-mute)]">
                  O pipeline sera iniciado automaticamente.
                </span>
              </div>
              <div className="mt-2 flex gap-2 overflow-hidden">
                {selectedLives.slice(0, 3).map((live) => (
                  <span
                    key={live.video_id}
                    className="max-w-[260px] truncate rounded-full border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 py-1 text-xs text-[var(--wb-text-mute)]"
                  >
                    {live.titulo}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedIds(new Set())}>
                Desmarcar todos
              </Button>
              <Button type="button" onClick={processSelected} disabled={enqueueMutation.isPending}>
                {enqueueMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                Baixar e processar
              </Button>
            </div>
          </section>
        )}

        <section className="grid gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--wb-text-mute)]">
              {livesQuery.isLoading ? 'Buscando lives...' : `${lives.length} live(s) encontrada(s)`}
            </span>
            <div className="flex-1" />
            {lives.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={selectNotDownloaded}>
                <Check className="text-success" />
                Selecionar nao baixadas
              </Button>
            )}
          </div>

          {livesQuery.isError && (
            <div className="rounded-[var(--radius)] border border-error/30 bg-error/10 p-4 text-sm text-error">
              {livesQuery.error instanceof Error
                ? livesQuery.error.message
                : 'Nao foi possivel buscar as lives.'}
            </div>
          )}

          {!livesQuery.isLoading && lives.length === 0 && !livesQuery.isError && (
            <div className="grid min-h-[240px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
              <div>
                <Radio size={34} className="mx-auto mb-3 text-[var(--wb-text-dim)]" aria-hidden />
                <p className="font-editorial text-3xl font-medium">Nenhuma live encontrada</p>
                <p className="mt-1 text-sm text-[var(--wb-text-mute)]">
                  Ajuste a data ou confira a configuracao do canal no backend.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {lives.map((live) => (
              <LiveRow
                key={live.video_id}
                live={live}
                selected={selectedIds.has(live.video_id)}
                onToggle={() => toggleLive(live)}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function LiveRow({
  live,
  selected,
  onToggle,
}: {
  live: YoutubeLive;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      className={cn(
        'grid items-center gap-3 rounded-[var(--radius-lg)] border bg-[var(--wb-bg-card)] p-3 shadow-[var(--wb-shadow)] transition-colors',
        'md:grid-cols-[28px_146px_minmax(0,1fr)_auto]',
        selected
          ? 'border-[var(--wb-accent)] bg-[color-mix(in_oklch,var(--wb-accent)_8%,var(--wb-bg-card))]'
          : 'border-[var(--wb-border-soft)]',
        live.ja_baixado && 'opacity-65',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={live.ja_baixado}
        aria-label={selected ? 'Desmarcar live' : 'Selecionar live'}
        className={cn(
          'flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border transition-colors',
          selected
            ? 'border-success bg-success text-white'
            : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-transparent',
          live.ja_baixado && 'cursor-not-allowed',
        )}
      >
        <Check size={13} strokeWidth={2.4} aria-hidden />
      </button>

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

      <div className="min-w-0">
        <h3 className="truncate text-base font-extrabold leading-tight text-[var(--wb-text)]">
          {live.titulo}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--wb-text-dim)]">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} aria-hidden />
            {formatPublishedAt(live.data_publicacao)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden />
            {formatDuration(live.duracao_iso)}
          </span>
          <span className="inline-flex items-center gap-1">
            <AtSign size={12} aria-hidden />
            YouTube
          </span>
          {live.ja_baixado && (
            <span className="rounded-full border border-[var(--wb-border)] px-2 py-0.5 text-[11px] text-[var(--wb-text-mute)]">
              baixada
            </span>
          )}
        </div>
      </div>

      <a
        href={live.youtube_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 text-xs font-bold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
      >
        <ExternalLink size={12} aria-hidden />
        Ver
      </a>
    </article>
  );
}
