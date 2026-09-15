import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  DownloadCloud,
  Eraser,
  FolderOpen,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, formatarDataLive, formatarDuracao, thumbnailUrl } from '@/lib/utils';
import { useLimparArquivos, useRebaixarVideo, useRemoverProjeto } from '@/hooks/useProjetos';
import type { Projeto } from '@/types/models';
import { PipelineProgress } from './PipelineProgress';
import { estadoDoProjeto } from './statusMaps';

const PLACEHOLDER_HUES = [22, 280, 160, 340, 240, 60, 200, 100];

const BOTAO_ICONE =
  'flex h-7 w-[30px] flex-none items-center justify-center rounded-[7px] bg-[var(--wb-bg-inset)] transition-colors disabled:cursor-not-allowed disabled:opacity-45';

interface Props {
  projeto: Projeto;
  index?: number;
}

// Card da Biblioteca (D-399). Três faixas empilhadas, de cima pra baixo:
//   1. faixa de estado — estado editorial do projeto + nota do ranking;
//   2. thumb 16:9 (duração e progresso de download), título e meta;
//   3. rodapé — pipeline em ÍCONES e as ações do projeto explícitas.
//
// O ⋯ (OverflowMenu) saiu: o painel abria dentro de um card com
// `overflow-hidden` e ficava recortado, então as três ações viraram botões
// na barra de baixo. O rótulo solto de estado ("em edição"/"publicado")
// também saiu do rodapé — agora vive na faixa do topo, sem duplicar.
export function ProjetoCard({ projeto, index = 0 }: Props) {
  const navigate = useNavigate();
  const remover = useRemoverProjeto();
  const limpar = useLimparArquivos();
  const rebaixar = useRebaixarVideo();
  const [thumbErr, setThumbErr] = useState(false);

  const estado = estadoDoProjeto(projeto);
  const EstadoIcon = estado.Icon;
  const nota = Math.round(projeto.pontuacao_ranking);
  const thumb = thumbnailUrl(projeto.youtube_url, 'mq');
  const baixando = projeto.status === 'baixando';
  const limpo = projeto.arquivos_limpos;
  const firesPendentes = projeto.fires_pendentes > 0;
  const prontoParaLimpar = !limpo && !firesPendentes;
  const rebaixando = Boolean(projeto.rebaixando_video) || rebaixar.isPending;
  const placeholderHue = PLACEHOLDER_HUES[index % PLACEHOLDER_HUES.length];

  const onCardClick = () => {
    navigate(`/projetos/${projeto.id}`);
  };

  const onDelete = () => {
    if (!confirm(`Remover o projeto "${projeto.titulo_live}"? Esta acao nao pode ser desfeita.`))
      return;
    remover.mutate(projeto.id);
  };

  // D-457: quando a live tem corte Fire, a limpeza faz UMA pergunta a mais —
  // o bruto do Fire e a materia-prima da fabrica de shorts, e apaga-lo por
  // engano custa re-extrair o trecho da live inteira. Cancelar a segunda
  // pergunta (ou apertar Esc) PRESERVA: o caminho mais seguro e o default.
  // Confirma porque baixa uma live inteira: dezenas de minutos e GBs. O texto
  // diz o que PRESERVA, que é a diferença para o "reiniciar download" da tela
  // de erro — aquele refaz a transcrição e deslocaria todos os cortes.
  const onRebaixar = () => {
    if (rebaixando) return;
    if (
      !confirm(
        `Baixar o video de "${projeto.titulo_live}" de novo?

` + 'Transcricao, cortes e metadados sao preservados — so o arquivo pesado volta.',
      )
    )
      return;
    rebaixar.mutate(projeto.id);
  };

  const onLimpar = async () => {
    if (limpo) return;
    if (
      !confirm(
        `Limpar midia pesada de "${projeto.titulo_live}" preservando graded, overlays, logs e metadados?`,
      )
    )
      return;

    limpar.mutate({ id: projeto.id });
  };

  return (
    <article
      onClick={onCardClick}
      onKeyDown={(event) => {
        // Só o card responde ao Enter: sem o teste de alvo, o Enter num botão
        // da barra de ações disparava a ação E navegava.
        if (event.key === 'Enter' && event.target === event.currentTarget) onCardClick();
      }}
      tabIndex={0}
      role="button"
      aria-label={`Abrir projeto ${projeto.titulo_live} — ${estado.label}`}
      className={cn(
        // `transition-all` incluía background-color: ao alternar o tema o card
        // ficava preso na cor antiga (clara no escuro) até a próxima recalc de
        // estilo. Transicionar só o que a interação anima resolve.
        'group flex cursor-pointer flex-col overflow-hidden rounded-[12px] border bg-[var(--wb-bg-panel)] shadow-[shadow:var(--wb-shadow)] transition-[transform,border-color,box-shadow] duration-200',
        'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        estado.key === 'publicado'
          ? 'border-[var(--wb-ok)]'
          : 'border-[var(--wb-border)] hover:border-[var(--wb-text-dim)]',
      )}
    >
      {/* 1. Faixa de estado + nota do ranking. */}
      <div
        className={cn(
          'flex items-center gap-1.5 border-b border-black/5 px-2.5 py-1.5',
          estado.faixaClass,
        )}
      >
        <EstadoIcon
          size={14}
          strokeWidth={2.4}
          aria-hidden
          className={cn('flex-none', estado.animate && 'animate-spin')}
        />
        <span className="truncate text-[11.5px] font-bold uppercase tracking-[0.04em]">
          {estado.label}
          {baixando && ` ${Math.round(projeto.progresso_download)}%`}
        </span>
        {firesPendentes && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-[5px] bg-[var(--wb-fire-soft)] px-1.5 py-0.5 font-code text-[9.5px] font-bold normal-case tracking-normal text-[var(--wb-fire)]"
            title={`${projeto.fires_pendentes} Fire${projeto.fires_pendentes === 1 ? '' : 's'} ainda precisa${projeto.fires_pendentes === 1 ? '' : 'm'} de shorts`}
          >
            🔥 {projeto.fires_pendentes} pendente{projeto.fires_pendentes === 1 ? '' : 's'}
          </span>
        )}
        {prontoParaLimpar && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-[5px] bg-[var(--wb-ok-soft)] px-1.5 py-0.5 font-code text-[9.5px] font-bold normal-case tracking-normal text-[var(--wb-ok-ink)]"
            title="Todos os Fires foram finalizados ou rejeitados. É seguro limpar a mídia pesada."
          >
            <ShieldCheck size={11} aria-hidden />
            pronto para limpar
          </span>
        )}
        <div className="flex-1" />
        {nota > 0 && (
          <Tooltip label={`Nota do projeto no ranking de lives: ${nota}/100`} side="top">
            <span className="inline-flex flex-none items-center gap-1 font-code text-[11.5px] font-bold tabular-nums">
              <Trophy size={12} strokeWidth={2.4} aria-hidden />
              {nota}
            </span>
          </Tooltip>
        )}
      </div>

      {/* 2. Thumb + identificação. */}
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

        {projeto.duracao_segundos > 0 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-[5px] bg-black/60 px-1.5 py-0.5 font-code text-[10.5px] font-bold tabular-nums text-white">
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

      <div className="px-3 py-2.5">
        <h3
          className="truncate text-[14px] font-bold leading-snug text-[var(--wb-text)]"
          title={projeto.titulo_live}
        >
          {projeto.titulo_live || 'Sem titulo'}
        </h3>
        <p className="mt-1 truncate text-[11.5px] text-[var(--wb-text-dim)]">
          {projeto.canal_origem?.replace('@', '') || 'canal'}
          {projeto.data_live ? ` · ${formatarDataLive(projeto.data_live)}` : ''}
        </p>
        <p className="mt-0.5 font-code text-[11px] font-semibold tabular-nums text-[var(--wb-text-mute)]">
          {projeto.total_cortes} cortes · {projeto.total_publicados} publicados
        </p>
      </div>

      {/* 3a. Pipeline em ícones — o ícone diz QUAL etapa é sem depender de
          tooltip; os pips coloridos não diziam. */}
      <div className="mt-auto border-t border-[var(--wb-border-soft)] px-3 py-2">
        <PipelineProgress projeto={projeto} compact />
      </div>

      {/* 3b. Ações do projeto, no lugar do ⋯ recortado. */}
      <div
        className="flex items-center gap-1.5 border-t border-[var(--wb-border-soft)] px-2.5 py-2"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCardClick}
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] bg-[var(--wb-bg-inset)] text-[11.5px] font-bold text-[var(--wb-text)] transition-colors hover:bg-[var(--wb-accent)] hover:text-[var(--wb-accent-fg)]"
        >
          <FolderOpen size={13} strokeWidth={2.3} aria-hidden />
          Abrir
        </button>

        {/* D-527: a limpeza deixou de ser mão única. Só aparece quando ela já
            aconteceu — antes disso não há o que rebaixar, e um botão que baixa
            uma live inteira não deve ficar à mão sem motivo. */}
        {limpo && (
          <button
            type="button"
            onClick={onRebaixar}
            disabled={rebaixando}
            aria-label="Baixar o vídeo da live de novo"
            title="Baixar o vídeo da live de novo. Preserva transcrição, cortes e metadados."
            className={cn(BOTAO_ICONE, 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]')}
          >
            {rebaixando ? (
              <Loader2 size={14} strokeWidth={2.3} className="animate-spin" aria-hidden />
            ) : (
              <DownloadCloud size={14} strokeWidth={2.3} aria-hidden />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onLimpar}
          disabled={limpo || limpar.isPending}
          aria-label={limpo ? 'Mídia pesada já limpa' : 'Limpar mídia pesada'}
          title={
            limpo
              ? 'Mídia pesada já limpa'
              : firesPendentes
                ? `Limpar mídia pesada e preservar ${projeto.fires_pendentes} Fire${projeto.fires_pendentes === 1 ? '' : 's'} pendente${projeto.fires_pendentes === 1 ? '' : 's'}`
                : 'Limpar mídia pesada: todos os Fires já estão resolvidos'
          }
          className={cn(
            BOTAO_ICONE,
            limpo
              ? 'text-[var(--wb-ok-ink)]'
              : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
          )}
        >
          {limpo ? (
            <Sparkles size={14} strokeWidth={2.3} aria-hidden />
          ) : (
            <Eraser size={14} strokeWidth={2.3} aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={remover.isPending}
          aria-label="Remover projeto"
          title="Remover projeto"
          className={cn(BOTAO_ICONE, 'text-[var(--wb-err)] hover:bg-[var(--wb-err-soft)]')}
        >
          <Trash2 size={14} strokeWidth={2.3} aria-hidden />
        </button>
      </div>
    </article>
  );
}
