import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AtSign,
  ChevronRight,
  Clock,
  Cloud,
  Eraser,
  Scissors,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, formatarDataLive, formatarDuracao, thumbnailUrl } from '@/lib/utils';
import { estaProntoPraYoutube, useLimparArquivos, useRemoverProjeto } from '@/hooks/useProjetos';
import type { Projeto } from '@/types/models';
import { PipelineProgress } from './PipelineProgress';

const PLACEHOLDER_HUES = [22, 280, 160, 340, 240, 60, 200, 100];

interface Props {
  projeto: Projeto;
  index?: number;
}

export function ProjetoCard({ projeto, index = 0 }: Props) {
  const navigate = useNavigate();
  const remover = useRemoverProjeto();
  const limpar = useLimparArquivos();
  const [thumbErr, setThumbErr] = useState(false);

  const pronto = estaProntoPraYoutube(projeto);
  const thumb = thumbnailUrl(projeto.youtube_url, 'mq');
  const baixando = projeto.status === 'baixando';
  const limpo = projeto.arquivos_limpos;
  const placeholderHue = PLACEHOLDER_HUES[index % PLACEHOLDER_HUES.length];

  const onCardClick = () => {
    navigate(`/projetos/${projeto.id}`);
  };

  const onDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm(`Remover o projeto "${projeto.titulo_live}"? Esta acao nao pode ser desfeita.`))
      return;
    remover.mutate(projeto.id);
  };

  const onLimpar = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (limpo) return;
    if (
      !confirm(
        `Limpar midia pesada de "${projeto.titulo_live}" preservando graded, overlays, logs e metadados?`,
      )
    )
      return;
    limpar.mutate(projeto.id);
  };

  return (
    <article
      onClick={onCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCardClick();
      }}
      tabIndex={0}
      role="button"
      aria-label={`Abrir projeto ${projeto.titulo_live}`}
      className={cn(
        'group flex min-h-full cursor-pointer flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--wb-bg-card)] shadow-[var(--wb-shadow)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[var(--wb-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        pronto ? 'border-[var(--wb-accent)]/50' : 'border-[var(--wb-border-soft)]',
      )}
    >
      <div className="relative">
        {thumb && !thumbErr ? (
          <div className="relative aspect-video overflow-hidden bg-[var(--wb-bg-inset)]">
            <img
              src={thumb}
              alt=""
              loading="lazy"
              onError={() => setThumbErr(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        ) : (
          <ThumbnailPlaceholder hue={placeholderHue} />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <StatusChip status={projeto.status} />
          {projeto.pontuacao_ranking > 0 && (
            <Tooltip
              label={`Pontuação do ranking de lives: ${Math.round(projeto.pontuacao_ranking)}/100`}
              side="top"
            >
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--wb-pill-bg)] px-2 py-1 font-code text-[11px] font-bold tabular-nums text-[var(--wb-text)] backdrop-blur">
                <Trophy size={11} aria-hidden />
                {Math.round(projeto.pontuacao_ranking)}
              </span>
            </Tooltip>
          )}
        </div>

        {projeto.duracao_segundos > 0 && (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-[var(--wb-pill-bg)] px-2 py-1 font-code text-[11px] tabular-nums text-[var(--wb-text)] backdrop-blur">
            <Clock size={11} aria-hidden />
            {formatarDuracao(projeto.duracao_segundos)}
          </span>
        )}

        {baixando && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <div
              className="h-full bg-warning transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, projeto.progresso_download))}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 min-h-[2.45em] font-editorial text-lg font-medium leading-tight text-[var(--wb-text)]">
          {projeto.titulo_live || 'Sem titulo'}
        </h3>

        <div className="flex items-center justify-between gap-3 text-xs text-[var(--wb-text-mute)]">
          <span className="flex min-w-0 items-center gap-1.5">
            <AtSign size={13} aria-hidden />
            <span className="truncate">{projeto.canal_origem?.replace('@', '') || 'canal'}</span>
          </span>
          {projeto.data_live && (
            <time className="font-code text-[11px] text-[var(--wb-text-dim)]">
              {formatarDataLive(projeto.data_live)}
            </time>
          )}
        </div>

        <div className="flex items-center gap-4 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
          <div className="flex items-baseline gap-1.5 text-[var(--wb-text)]">
            <Scissors size={14} className="self-center text-[var(--wb-accent)]" aria-hidden />
            <span className="font-editorial text-xl leading-none">{projeto.total_cortes}</span>
            <span className="text-[11px] text-[var(--wb-text-dim)]">cortes</span>
          </div>
          <span className="h-4 w-px bg-[var(--wb-border)]" aria-hidden />
          <div className="flex items-baseline gap-1.5 text-[var(--wb-text)]">
            <Cloud size={14} className="self-center text-[var(--wb-text-mute)]" aria-hidden />
            <span className="font-editorial text-xl leading-none">{projeto.total_publicados}</span>
            <span className="text-[11px] text-[var(--wb-text-dim)]">na nuvem</span>
          </div>
        </div>

        <PipelineProgress projeto={projeto} />

        <div className="mt-auto flex items-center gap-2 border-t border-[var(--wb-border-soft)] pt-3">
          <Button className="flex-1" size="sm" variant="secondary">
            Abrir projeto
            <ChevronRight size={14} aria-hidden />
          </Button>
          <Tooltip label={limpo ? 'Midia pesada ja foi limpa' : 'Limpar midia pesada'} side="top">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onLimpar}
              disabled={limpar.isPending || limpo}
              aria-label="Limpar arquivos"
              className={cn(limpo && 'text-info')}
            >
              {limpo ? <Sparkles size={14} /> : <Eraser size={14} />}
            </Button>
          </Tooltip>
          <Tooltip label="Remover projeto" side="top">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onDelete}
              disabled={remover.isPending}
              aria-label="Remover projeto"
              className="text-[var(--wb-text-mute)] hover:border-error/40 hover:bg-error/10 hover:text-error"
            >
              <Trash2 size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}
