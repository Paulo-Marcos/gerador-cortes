import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Eraser, Sparkles, Trash2, Trophy } from 'lucide-react';
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

// Card do protótipo Workbench (§Biblioteca): thumb 16:9 com chips
// sobrepostos, título em 1 linha, meta "canal · data · N cortes ·
// N publicados" e mini-pipeline no rodapé. Ações destrutivas
// (limpar/remover) só aparecem no hover/foco.
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
        'group cursor-pointer overflow-hidden rounded-[12px] border bg-[var(--wb-bg-panel)] shadow-[shadow:var(--wb-shadow)] transition-all duration-200',
        'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        pronto
          ? 'border-[var(--wb-ok)]'
          : 'border-[var(--wb-border)] hover:border-[var(--wb-text-dim)]',
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

        <div className="absolute left-2 top-2">
          {pronto ? (
            <span className="rounded-[5px] bg-[var(--wb-ok)] px-2 py-0.5 text-[9px] font-bold text-white">
              pronto p/ YouTube
            </span>
          ) : (
            <StatusChip status={projeto.status} />
          )}
        </div>

        {projeto.pontuacao_ranking > 0 && (
          <Tooltip
            label={`Pontuação do ranking de lives: ${Math.round(projeto.pontuacao_ranking)}/100`}
            side="top"
          >
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-[5px] bg-black/55 px-1.5 py-0.5 font-code text-[9px] font-bold tabular-nums text-white">
              <Trophy size={10} aria-hidden />
              {Math.round(projeto.pontuacao_ranking)}
            </span>
          </Tooltip>
        )}

        {projeto.duracao_segundos > 0 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-[5px] bg-black/55 px-1.5 py-0.5 font-code text-[9px] font-bold tabular-nums text-white">
            <Clock size={10} aria-hidden />
            {formatarDuracao(projeto.duracao_segundos)}
          </span>
        )}

        {/* Ações destrutivas em hover (protótipo: ações em hover/menu) */}
        <div
          onClick={(event) => event.stopPropagation()}
          className="absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <Tooltip label={limpo ? 'Midia pesada ja foi limpa' : 'Limpar midia pesada'} side="top">
            <button
              type="button"
              onClick={onLimpar}
              disabled={limpar.isPending || limpo}
              aria-label="Limpar arquivos"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm hover:bg-black/85 disabled:opacity-40',
                limpo && 'text-info',
              )}
            >
              {limpo ? <Sparkles size={12} aria-hidden /> : <Eraser size={12} aria-hidden />}
            </button>
          </Tooltip>
          <Tooltip label="Remover projeto" side="top">
            <button
              type="button"
              onClick={onDelete}
              disabled={remover.isPending}
              aria-label="Remover projeto"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm hover:bg-error/80 disabled:opacity-40"
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </Tooltip>
        </div>

        {baixando && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <div
              className="h-full bg-warning transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, projeto.progresso_download))}%` }}
            />
          </div>
        )}
      </div>

      <div className="px-2.5 py-2">
        <h3
          className="truncate text-[11.5px] font-bold text-[var(--wb-text)]"
          title={projeto.titulo_live}
        >
          {projeto.titulo_live || 'Sem titulo'}
        </h3>
        <p className="mt-0.5 truncate text-[9.5px] text-[var(--wb-text-dim)]">
          {projeto.canal_origem?.replace('@', '') || 'canal'}
          {projeto.data_live ? ` · ${formatarDataLive(projeto.data_live)}` : ''}
          {` · ${projeto.total_cortes} cortes · ${projeto.total_publicados} publicados`}
        </p>
        <div className="mt-2">
          <PipelineProgress projeto={projeto} />
        </div>
      </div>
    </article>
  );
}
