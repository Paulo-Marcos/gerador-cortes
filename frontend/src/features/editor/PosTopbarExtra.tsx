import { Fragment } from 'react';
import { BookOpen, Check, Eye, FileText, Flame, Layers, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// PosTopbarExtra — replica `design_reference/src/v3_pos.jsx:22-144`.
// Entra no slot `extra` do CommonTopBar na fase Pos.
// Junta VideoTypeMarker (so leitura) + PosStepperBar (4 passos clicaveis).
// ─────────────────────────────────────────────────────────────

export type PosStep = 1 | 2 | 3 | 4;
export type VideoTipo = 'top' | 'leitura' | null;

interface PosTopbarExtraProps {
  /** TOP, LEITURA ou null (sem marcador). Vem do classificacao do corte (is_fire/is_leitura). */
  tipo?: VideoTipo;
  /** Passo ativo (1=Metadados, 2=Cenas, 3=Validar, 4=Renderizar). */
  active: PosStep;
  /** Passos marcados como concluidos (numeral vira ✓ em ok). */
  done?: Set<PosStep>;
  /** Callback ao clicar o passo Metadados (passo 1). Abre o MetadataModal. */
  onMetadadosClick?: () => void;
  /** Callback ao clicar o passo Cenas (passo 2). Navega/foca a aba Cenas. */
  onCenasClick?: () => void;
  /** Callback ao clicar Validar (3). Tipicamente foca a CTA "Marcar validadas". */
  onValidarClick?: () => void;
  /** Callback ao clicar Renderizar (4). Tipicamente dispara o render. */
  onRenderClick?: () => void;
}

export function PosTopbarExtra({
  tipo,
  active,
  done,
  onMetadadosClick,
  onCenasClick,
  onValidarClick,
  onRenderClick,
}: PosTopbarExtraProps) {
  return (
    <div className="inline-flex items-center gap-2.5">
      {tipo && <VideoTypeMarker tipo={tipo} />}
      {tipo && <span aria-hidden className="h-[18px] w-px bg-[var(--wb-border)]" />}
      <PosStepperBar
        active={active}
        done={done}
        onClickStep={(n) => {
          if (n === 1) onMetadadosClick?.();
          else if (n === 2) onCenasClick?.();
          else if (n === 3) onValidarClick?.();
          else if (n === 4) onRenderClick?.();
        }}
      />
    </div>
  );
}

// ── VideoTypeMarker · v3_pos.jsx:22-50 ───────────────────────
// Pill read-only: TOP (fire) ou LEITURA (leitura). Indica
// classificacao herdada do Bruto — nao e editavel aqui.
function VideoTypeMarker({ tipo }: { tipo: NonNullable<VideoTipo> }) {
  const conf =
    tipo === 'top'
      ? { color: 'var(--wb-fire)', Icon: Flame, label: 'TOP' }
      : { color: 'var(--wb-leitura)', Icon: BookOpen, label: 'LEITURA' };
  const { Icon, label, color } = conf;
  return (
    <span
      title={`Video classificado como ${label} (vindo do Bruto)`}
      style={{
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        color,
      }}
      className="inline-flex h-[26px] cursor-default select-none items-center gap-1.5 rounded-full px-2.5 pl-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em]"
    >
      <Icon size={12} strokeWidth={2.2} aria-hidden />
      {label}
    </span>
  );
}

// ── PosStepperBar · v3_pos.jsx:66-144 ────────────────────────
// 4 passos numa pill bg-inset. Passos clicaveis. Ativo = bg accent +
// texto ink-fg. Done = numeral vira check em ok. Conector accent
// ate o passo atual, border para os depois.
const STEPS: Array<{ n: PosStep; label: string; Icon: typeof FileText }> = [
  { n: 1, label: 'Metadados', Icon: FileText },
  { n: 2, label: 'Cenas', Icon: Layers },
  { n: 3, label: 'Validar', Icon: Eye },
  { n: 4, label: 'Renderizar', Icon: Rocket },
];

function PosStepperBar({
  active,
  done,
  onClickStep,
}: {
  active: PosStep;
  done?: Set<PosStep>;
  onClickStep?: (n: PosStep) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-1">
      {STEPS.map((s, i) => {
        const isActive = s.n === active;
        const isDone = done?.has(s.n) ?? false;
        const reached = s.n <= active;
        return (
          <Fragment key={s.n}>
            {i > 0 && (
              <span
                aria-hidden
                style={{ background: reached ? 'var(--wb-accent)' : 'var(--wb-border)' }}
                className="mx-1 h-0.5 w-3.5"
              />
            )}
            <button
              type="button"
              onClick={() => onClickStep?.(s.n)}
              title={s.n === 1 ? 'Abrir metadados' : `Ir para ${s.label}`}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border-0 px-3 pl-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
                isActive
                  ? 'bg-[var(--wb-accent)] text-[var(--wb-ink-fg)]'
                  : isDone
                    ? 'bg-transparent text-[var(--wb-ok)] hover:bg-[var(--wb-bg-card)]'
                    : 'bg-transparent text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-card)] hover:text-[var(--wb-text)]',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full font-code text-[10.5px] font-bold',
                  isActive
                    ? 'bg-[var(--wb-ink-fg)] text-[var(--wb-accent)]'
                    : isDone
                      ? 'bg-[var(--wb-ok)] text-white'
                      : 'border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-dim)]',
                )}
              >
                {isDone ? <Check size={11} strokeWidth={3} aria-hidden /> : s.n}
              </span>
              <span className={cn('text-[12px]', isActive ? 'font-bold' : 'font-semibold')}>
                {s.label}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
