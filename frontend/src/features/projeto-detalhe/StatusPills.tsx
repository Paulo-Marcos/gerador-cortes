import {
  Clapperboard,
  Film,
  Image,
  Palette,
  Scissors,
  Sparkles,
  Tags,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusExportCorte } from '@/types/models';

interface PillSpec {
  emoji: string;
  Icon: LucideIcon;
  label: string;
  done: boolean;
  hint: string;
}

// D-746: a ordem é a do fluxo — Thumb e Meta são pré-requisitos do YouTube.
// Com o YouTube antes delas, um corte renderizado e sem capa apontava
// "YouTube" como próxima etapa, uma instrução errada.
export function buildStatusPills(corte: StatusExportCorte): PillSpec[] {
  return [
    {
      emoji: '🎞️',
      label: 'Bruto',
      Icon: Scissors,
      done: corte.raw_pronto,
      hint: 'Recorte bruto exportado',
    },
    {
      emoji: '🎭',
      label: 'Cenas',
      Icon: Clapperboard,
      done: Boolean(corte.cenas_validadas),
      hint: corte.cenas_validadas
        ? 'Cenas Remotion validadas pelo editor'
        : corte.cenas_geradas
          ? 'Cenas geradas, aguardando validacao'
          : 'Sem cenas Remotion ainda',
    },
    {
      emoji: '🎨',
      label: 'Graded',
      Icon: Palette,
      done: corte.grade_pronta,
      hint: 'Fase 1 do render final concluida (clip_graded.mp4)',
    },
    {
      emoji: '✨',
      label: 'Overlays',
      Icon: Sparkles,
      done: Boolean(corte.overlays_prontos),
      hint: 'Fase 2 do render final concluida (overlays Remotion)',
    },
    {
      emoji: '🎬',
      label: 'Final',
      Icon: Film,
      done: corte.video_pronto,
      hint: 'Render final completo (upload_ready/video.mp4)',
    },
    {
      emoji: '🖼️',
      label: 'Thumb',
      Icon: Image,
      done: corte.thumbnail_pronta,
      hint: 'Thumbnail gerada',
    },
    {
      emoji: '📝',
      label: 'Meta',
      Icon: Tags,
      done: corte.metadados_completos,
      hint: 'Metadados (titulo, descricao, tags) completos',
    },
    {
      emoji: '📺',
      label: 'YouTube',
      Icon: Youtube,
      done: Boolean(corte.youtube_url_publicado),
      hint: corte.youtube_url_publicado
        ? 'Publicado no YouTube'
        : corte.youtube_scheduled_at
          ? 'Agendado no YouTube'
          : 'Ainda nao publicado',
    },
  ];
}

/** Estado visual de cada etapa da tira. */
type PipState = 'done' | 'next' | 'rejected' | 'off';

// Badge do ícone no card do corte — mesma linguagem do rail de projetos:
// o ícone diz QUAL etapa é, a cor diz em que estado ela está.
const CLASSE_BADGE: Record<PipState, string> = {
  done: 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]',
  next: 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn-ink)]',
  rejected: 'bg-[var(--wb-err-soft)] text-[var(--wb-err-ink)]',
  off: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] opacity-55',
};

/**
 * Rótulo-resumo à direita da tira (protótipo v3): diz em uma expressão o
 * que os 8 pips mostram em detalhe.
 */
function resumoDoCorte(
  corte: StatusExportCorte,
  feitos: number,
  rejeitado: boolean,
  // R4: o total vem da lista, não de um 8 fixo — acrescentar uma etapa fazia
  // a tira contar 9 pips e o resumo continuar dizendo "/8".
  total: number,
) {
  if (rejeitado) return { texto: 'rejeitado', cor: 'var(--wb-err-ink)' };
  if (feitos === total) return { texto: `${total}/${total} ▶`, cor: 'var(--wb-ok-ink)' };
  if (!corte.video_pronto) return { texto: 'sem render', cor: 'var(--wb-warn-ink)' };
  return { texto: `${feitos}/${total}`, cor: 'var(--wb-text-mute)' };
}

/**
 * Tira compacta dos pips do pipeline do corte (DE-PARA-v3 §2):
 * Bruto -> Cenas -> Graded -> Overlays -> Final -> Thumb -> Meta -> YouTube.
 *
 * Ordem cronologica do pipeline: cenas validadas, depois o render final em
 * tres fases (graded, overlays, composicao final), e a publicacao por ultimo.
 * D-746: Thumb e Meta vem ANTES do YouTube porque sao pre-requisitos dele —
 * na ordem antiga, um corte renderizado e sem capa marcava "YouTube" como
 * proxima etapa, que e instrucao errada. Nao reordene de volta.
 *
 * Substitui os 8 pills com emoji+rótulo: no card estreito eles quebravam em
 * várias linhas e dominavam o card. Aqui a cor carrega o estado, o `title`
 * carrega o detalhe e o rótulo-resumo carrega a leitura rápida.
 */
export function StatusPipStrip({
  corte,
  statusCorte,
}: {
  corte: StatusExportCorte;
  /** Status editorial: 'rejeitado' pinta o primeiro pip e apaga o resto. */
  statusCorte?: string;
}) {
  const pills = buildStatusPills(corte);
  const rejeitado = statusCorte === 'rejeitado';
  // O "próximo" é o primeiro pendente: destaca em warn para mostrar onde o
  // pipeline parou, em vez de deixar tudo cinza depois do último feito.
  const indiceProximo = rejeitado ? -1 : pills.findIndex((p) => !p.done);

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="list"
      aria-label="Status do corte"
      title={pills.map((p) => p.label.toUpperCase()).join('·')}
    >
      {pills.map((p, i) => {
        const estado: PipState = rejeitado
          ? i === 0
            ? 'rejected'
            : 'off'
          : p.done
            ? 'done'
            : i === indiceProximo
              ? 'next'
              : 'off';
        const Icon = p.Icon;
        return (
          <span
            key={p.label}
            role="listitem"
            data-testid={`status-pill-${p.label.toLowerCase()}`}
            data-done={p.done ? 'true' : 'false'}
            title={`${p.label}: ${p.done ? 'feito' : 'pendente'} — ${p.hint}`}
            className={cn(
              'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full transition-all',
              CLASSE_BADGE[estado],
            )}
          >
            <Icon size={11} strokeWidth={2.2} aria-hidden />
          </span>
        );
      })}
    </div>
  );
}

/** Tira de pips + rótulo-resumo derivado (usado onde não há rótulo próprio). */
export function StatusPills({
  corte,
  statusCorte,
}: {
  corte: StatusExportCorte;
  statusCorte?: string;
}) {
  const pills = buildStatusPills(corte);
  const feitos = pills.filter((p) => p.done).length;
  const resumo = resumoDoCorte(corte, feitos, statusCorte === 'rejeitado', pills.length);

  return (
    <div className="flex items-center gap-2">
      <StatusPipStrip corte={corte} statusCorte={statusCorte} />
      <span
        className="ml-auto flex-none font-code text-[9px] font-semibold"
        style={{ color: resumo.cor }}
      >
        {resumo.texto}
      </span>
    </div>
  );
}
