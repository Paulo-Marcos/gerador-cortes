import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  FolderOpen,
  ImageOff,
  Loader2,
  Smartphone,
  Tags,
  UploadCloud,
  Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { resolveThumbUrl } from '@/lib/api';
import { useAbrirPasta } from '@/hooks/useProjetoDetalhe';
import type { StatusExportCorte } from '@/types/models';
import { StatusPills } from './StatusPills';

interface Props {
  projetoId: string;
  corte: StatusExportCorte;
  selecionavel?: boolean;
  selecionado?: boolean;
  onToggleSelecionado?: () => void;
  onUploadYoutube?: () => void;
  uploadYoutubePending?: boolean;
  onMarcarPublicado?: () => void;
  marcarPublicadoPending?: boolean;
  // F-057: reposicionar corte na lista do Studio. Quando ambos sao null/
  // undefined os botoes nao aparecem (manter compatibilidade com chamadores
  // que nao expoem reordenacao, ex.: PublicarMassaModal).
  onMover?: (delta: -1 | 1) => void;
  podeSubir?: boolean;
  podeDescer?: boolean;
  reordenando?: boolean;
}

export function CorteCard({
  projetoId,
  corte,
  selecionavel = false,
  selecionado = false,
  onToggleSelecionado,
  onUploadYoutube,
  uploadYoutubePending = false,
  onMarcarPublicado,
  marcarPublicadoPending = false,
  onMover,
  podeSubir = false,
  podeDescer = false,
  reordenando = false,
}: Props) {
  const navigate = useNavigate();
  const abrirPasta = useAbrirPasta();
  const [thumbErr, setThumbErr] = useState(false);

  const thumb = resolveThumbUrl(projetoId, corte.thumbnail_path);
  const titulo = corte.titulo_youtube || corte.titulo || `Corte #${corte.numero}`;

  const onAbrirPasta = (e: React.MouseEvent) => {
    e.stopPropagation();
    abrirPasta.mutate(corte.corte_id);
  };
  const onEnviarYoutube = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUploadYoutube?.();
  };
  const onInformarYoutube = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarcarPublicado?.();
  };

  const irEditor = () => navigate(`/projetos/${projetoId}/cortes/${corte.corte_id}`);
  const podeEnviarYoutube = Boolean(
    onUploadYoutube && corte.pronto_publicar && !corte.youtube_url_publicado,
  );
  const podeInformarYoutube = Boolean(onMarcarPublicado && !corte.youtube_url_publicado);

  return (
    <article
      onClick={selecionavel ? undefined : irEditor}
      onKeyDown={(e) => {
        if (selecionavel) return;
        if (e.key === 'Enter') irEditor();
      }}
      tabIndex={selecionavel ? -1 : 0}
      role={selecionavel ? undefined : 'button'}
      aria-label={`Abrir editor do corte ${corte.numero}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[var(--radius)] border bg-surface-1 transition-all duration-200',
        !selecionavel &&
          'cursor-pointer hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-950',
        corte.pronto_publicar
          ? 'border-accent-500/40 shadow-[0_0_22px_var(--accent-glow)]'
          : 'border-[var(--border)] hover:border-[var(--border-hover)]',
        selecionavel && selecionado && 'ring-2 ring-accent-500',
      )}
    >
      {/* Banner publicado */}
      {corte.youtube_url_publicado && (
        <div className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-accent-600/30 via-accent-500/40 to-accent-600/30 border-b border-accent-500/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-200">
          <CheckCircle2 size={12} aria-hidden /> Publicado no YouTube
        </div>
      )}

      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-bg-900">
        {thumb && !thumbErr ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setThumbErr(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-500">
            <ImageOff size={28} aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-950/70 via-transparent to-transparent" />

        {/* Número do corte — texto fixo branco: o fundo `bg-black/70` é
            sempre escuro, então não pode usar token de tema (vira preto no
            tema claro e fica ilegível). */}
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-mono font-semibold text-white backdrop-blur-sm">
          #{corte.numero}
        </span>

        {/* F-057: setas de reposicionar — aparecem no hover do card. Param
            propagacao para nao abrir o editor quando o usuario clica. */}
        {onMover && (
          <div
            className={cn(
              'absolute left-1.5 top-9 flex flex-col gap-1 transition-opacity',
              'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
              reordenando && 'opacity-100',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip label="Mover para cima" side="right">
              <button
                type="button"
                onClick={() => onMover(-1)}
                disabled={!podeSubir || reordenando}
                aria-label={`Mover corte ${corte.numero} para cima`}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <ChevronUp size={13} strokeWidth={2.4} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Mover para baixo" side="right">
              <button
                type="button"
                onClick={() => onMover(1)}
                disabled={!podeDescer || reordenando}
                aria-label={`Mover corte ${corte.numero} para baixo`}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <ChevronDown size={13} strokeWidth={2.4} aria-hidden />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Pronto p/ publicar */}
        {corte.pronto_publicar && !corte.youtube_url_publicado && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-accent-500/40 bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-200 backdrop-blur">
            🚀 Pronto
          </span>
        )}

        {/* Checkbox de seleção (modo seleção) */}
        {selecionavel && (
          <label
            className="absolute bottom-2 left-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/70 px-2 py-1 text-[11px] text-white backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selecionado}
              onChange={onToggleSelecionado}
              className="h-3.5 w-3.5 accent-current text-accent-500"
            />
            Selecionar
          </label>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-3">
        <h3
          className="line-clamp-2 text-[13px] font-semibold leading-snug text-text-100"
          title={titulo}
        >
          {titulo}
        </h3>

        {/* Bottom-up: status pills, ações */}
        <div className="mt-auto flex flex-col gap-2.5 pt-3">
          <StatusPills corte={corte} />

          <div
            onClick={(e) => e.stopPropagation()}
            className="-mx-1 -mb-1 flex items-center justify-between gap-1 border-t border-[var(--border)] pt-1.5"
          >
            <div className="flex items-center gap-0.5">
              <Tooltip label="Editor de corte" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={irEditor}
                  aria-label="Abrir editor"
                >
                  <Clapperboard size={18} />
                </Button>
              </Tooltip>
              <Tooltip label="Metadados (título, descrição, capa)" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/projetos/${projetoId}/metadados`)}
                  aria-label="Abrir metadados"
                >
                  <Tags size={18} />
                </Button>
              </Tooltip>
              <Tooltip label="Fábrica de Shorts" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/projetos/${projetoId}/cortes/${corte.corte_id}/shorts`)}
                  aria-label="Gerar shorts"
                >
                  <Smartphone size={18} />
                </Button>
              </Tooltip>
              {podeEnviarYoutube && (
                <Tooltip label="Enviar video individual para o YouTube" side="top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onEnviarYoutube}
                    disabled={uploadYoutubePending}
                    aria-label="Enviar video individual para o YouTube"
                  >
                    {uploadYoutubePending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <UploadCloud size={18} />
                    )}
                  </Button>
                </Tooltip>
              )}
              {podeInformarYoutube && (
                <Tooltip label="Informar URL ja publicada no YouTube" side="top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onInformarYoutube}
                    disabled={marcarPublicadoPending}
                    aria-label="Informar URL ja publicada no YouTube"
                  >
                    {marcarPublicadoPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Youtube size={18} />
                    )}
                  </Button>
                </Tooltip>
              )}
            </div>
            <Tooltip label="Abrir pasta do corte" side="top">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onAbrirPasta}
                disabled={abrirPasta.isPending}
                aria-label="Abrir pasta"
              >
                <FolderOpen size={18} />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </article>
  );
}
