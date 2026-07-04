import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, Check, Flame, Youtube, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { CorteStatusCard } from './CorteStatusCard';

interface Props {
  projetoId: string;
  cortes: Corte[];
  corteAtivoId: string;
  exportStatus: StatusExportCorte[];
  getCortePath?: (corte: Corte) => string;
}

const APROVADO_STATUS = new Set<Corte['status']>(['aprovado', 'editado', 'processado']);

interface SinalFlags {
  aprovado: boolean;
  rejeitado: boolean;
  fire: boolean;
  leitura: boolean;
}

/** Mistura os sinais do corte num gradiente de fundo.  Rejeitado é exclusivo —
 *  ofusca os outros porque o corte está descartado da pipeline.  Quando o
 *  corte não está selecionado usamos a variante -soft (pastel quase invisível);
 *  o ativo recebe a versão vivid pra puxar o olho. */
function tintarFundo(flags: SinalFlags, ativo: boolean): string | undefined {
  const sfx = ativo ? '' : '-soft';
  if (flags.rejeitado) return `var(--tint-rejeitado${sfx})`;
  const stops: string[] = [];
  if (flags.aprovado) stops.push(`var(--tint-aprovado${sfx})`);
  if (flags.fire) stops.push(`var(--tint-fire${sfx})`);
  if (flags.leitura) stops.push(`var(--tint-leitura${sfx})`);
  if (stops.length === 0) return undefined;
  if (stops.length === 1) return stops[0];
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

export function EditorCutList({
  projetoId,
  cortes,
  corteAtivoId,
  exportStatus,
  getCortePath,
}: Props) {
  const navigate = useNavigate();
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusMap = new Map(exportStatus.map((s) => [s.corte_id, s] as const));

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'auto',
    });
  }, [corteAtivoId, cortes.length]);

  return (
    <aside
      aria-label="Cortes do projeto"
      className="fixed left-16 top-0 z-30 flex h-screen w-24 flex-col gap-1.5 overflow-y-auto border-r border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1.5 py-3.5"
    >
      <div className="px-1 pb-2 pt-1 text-center font-code text-[9.5px] uppercase tracking-[0.18em] text-[var(--wb-text-dim)]">
        cortes · {cortes.length}
      </div>

      {cortes.map((corte) => {
        const ativo = corte.id === corteAtivoId;
        const stat = statusMap.get(corte.id);
        const publicado = Boolean(stat?.youtube_url_publicado);
        const flags: SinalFlags = {
          aprovado: APROVADO_STATUS.has(corte.status),
          rejeitado: corte.status === 'rejeitado',
          fire: Boolean(corte.is_fire),
          leitura: Boolean(corte.is_leitura),
        };
        const tintBackground = tintarFundo(flags, ativo);
        const temSinais =
          flags.aprovado || flags.rejeitado || flags.fire || flags.leitura || publicado;

        // Quando há tint, ele substitui o bg padrão; sem tint, o ativo usa o
        // bg de card branco e o inativo herda do painel.
        const inlineStyle: React.CSSProperties | undefined = tintBackground
          ? { background: tintBackground }
          : undefined;

        return (
          <button
            key={corte.id}
            ref={ativo ? activeButtonRef : undefined}
            type="button"
            onClick={() =>
              navigate(getCortePath?.(corte) ?? `/projetos/${projetoId}/cortes/${corte.id}`)
            }
            aria-current={ativo ? 'page' : undefined}
            aria-label={`Corte ${corte.numero}${corte.titulo_proposto ? `: ${corte.titulo_proposto}` : ''}`}
            style={inlineStyle}
            className={cn(
              'group relative flex w-full flex-col items-center gap-1.5 rounded-[var(--radius)] border px-1.5 py-2.5 transition-colors',
              'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
              !tintBackground && 'hover:bg-[var(--wb-bg-inset)]',
              ativo
                ? cn(
                    'border-[var(--wb-border)] text-[var(--wb-text)] shadow-sm',
                    !tintBackground && 'bg-[var(--wb-bg-card)]',
                  )
                : 'border-transparent',
            )}
          >
            {ativo && (
              <span
                aria-hidden
                className="absolute bottom-3 left-[-7px] top-3 w-[2px] rounded-r-full bg-[var(--wb-accent)]"
              />
            )}

            <CorteStatusCard
              numero={corte.numero}
              titulo={corte.titulo_proposto}
              corteStatus={corte.status}
              status={stat}
              ativo={ativo}
              publicado={publicado}
              isFire={flags.fire}
              isLeitura={flags.leitura}
            />

            {temSinais && (
              <span
                className="flex min-h-[14px] items-center justify-center gap-1"
                aria-hidden="true"
              >
                {flags.aprovado && (
                  <Check size={11} strokeWidth={2.6} className="text-[var(--success)]" />
                )}
                {flags.rejeitado && (
                  <X size={11} strokeWidth={2.6} className="text-[var(--error)]" />
                )}
                {flags.fire && (
                  <Flame size={11} strokeWidth={2.2} className="text-[oklch(0.62_0.18_38)]" />
                )}
                {flags.leitura && (
                  <Book size={11} strokeWidth={2.2} className="text-[oklch(0.55_0.13_240)]" />
                )}
                {publicado && (
                  <Youtube size={11} strokeWidth={2.2} className="text-[var(--error)]" />
                )}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
}
