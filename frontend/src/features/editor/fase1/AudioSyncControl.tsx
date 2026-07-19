import { Headphones, RotateCcw, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// AudioSyncControl (F-063) — ajuste fino de lip-sync por corte.
// Nudge ± do offset (ms) + slider + reset + toggle de preview ao vivo.
// O valor é "dirty" no EditorPage; só persiste no Salvar e aplica no render.
//
// `variant="workbench"` (AUDITORIA-v2 §5, CP5) — faixa horizontal compacta
// hospedada como irmã do vídeo no shell novo (oculta por padrão, toggle 🎧
// na toolbar); mantém os 4 botões/slider/reset e ganha um botão de fechar.
// O toggle de preview ao vivo (fone) não existe no protótipo desta faixa —
// permanece disponível apenas em `variant="legacy"` (inalterado).
// ─────────────────────────────────────────────────────────────

export const MIN_MS = -2000;
export const MAX_MS = 2000;
export const STEP_FINO = 10;
const STEP_GROSSO = 100;

interface Props {
  offsetMs: number;
  onChange: (ms: number) => void;
  previewEnabled?: boolean;
  onTogglePreview?: () => void;
  /** Há proxy de áudio carregado para o preview ao vivo. */
  canPreview?: boolean;
  disabled?: boolean;
  /** AUDITORIA-v2 §5 (CP5): 'legacy' (default) preserva o layout/lógica
   *  atuais (dentro do PlayerPanel). 'workbench' é a faixa compacta nova. */
  variant?: 'legacy' | 'workbench';
  /** Só em variant='workbench': fecha a faixa (desliga o toggle 🎧). */
  onClose?: () => void;
}

export function AudioSyncControl({
  offsetMs,
  onChange,
  previewEnabled = false,
  onTogglePreview,
  canPreview = true,
  disabled,
  variant = 'legacy',
  onClose,
}: Props) {
  const clamp = (v: number) => Math.max(MIN_MS, Math.min(MAX_MS, Math.round(v)));
  const nudge = (delta: number) => onChange(clamp(offsetMs + delta));
  const rotulo = `${offsetMs > 0 ? '+' : ''}${offsetMs} ms`;

  if (variant === 'workbench') {
    return (
      <div className="flex flex-none flex-wrap items-center gap-2 rounded-[10px] border border-[var(--wb-accent)] bg-[var(--wb-bg-panel)] px-2.5 py-[7px]">
        <Headphones size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
        <span className="font-code text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
          Sincronia do áudio
        </span>

        <div className="flex items-baseline gap-[3px] rounded-[7px] bg-[var(--wb-bg-inset)] px-2.5 py-0.5">
          <span
            className={cn(
              'font-code text-[15px] font-extrabold',
              offsetMs === 0 ? 'text-[var(--wb-text)]' : 'text-[var(--wb-accent)]',
            )}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {offsetMs > 0 ? `+${offsetMs}` : offsetMs}
          </span>
          <span className="font-code text-[10px] font-bold text-[var(--wb-text-mute)]">ms</span>
        </div>

        <button
          type="button"
          onClick={() => nudge(-STEP_GROSSO)}
          disabled={disabled || offsetMs <= MIN_MS}
          className="rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-1.5 font-code text-[10px] font-bold text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
          aria-label="Adiantar áudio 100ms"
        >
          −100
        </button>
        <button
          type="button"
          onClick={() => nudge(-STEP_FINO)}
          disabled={disabled || offsetMs <= MIN_MS}
          className="rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-1.5 font-code text-[10px] font-bold text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
          aria-label="Adiantar áudio 10ms"
        >
          −10
        </button>
        <button
          type="button"
          onClick={() => nudge(STEP_FINO)}
          disabled={disabled || offsetMs >= MAX_MS}
          className="rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-1.5 font-code text-[10px] font-bold text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
          aria-label="Atrasar áudio 10ms"
        >
          +10
        </button>
        <button
          type="button"
          onClick={() => nudge(STEP_GROSSO)}
          disabled={disabled || offsetMs >= MAX_MS}
          className="rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-1.5 font-code text-[10px] font-bold text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
          aria-label="Atrasar áudio 100ms"
        >
          +100
        </button>

        <input
          type="range"
          min={MIN_MS}
          max={MAX_MS}
          step={STEP_FINO}
          value={offsetMs}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          disabled={disabled}
          aria-label="Offset de áudio em milissegundos"
          className="h-1.5 min-w-[90px] flex-1 cursor-pointer accent-[var(--wb-accent)]"
        />

        <button
          type="button"
          onClick={() => onChange(0)}
          disabled={disabled || offsetMs === 0}
          className="rounded-md bg-[var(--wb-bg-inset)] px-2.5 py-1.5 font-code text-[10px] font-bold text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
        >
          ⟲ resetar
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Fechar sincronia do áudio"
            aria-label="Fechar sincronia do áudio"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)]"
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-1.5">
      <Tooltip
        label={
          !canPreview
            ? 'Áudio do corte ainda não disponível para preview'
            : previewEnabled
              ? 'Preview ligado: ouvindo o áudio deslocado (vídeo mudo)'
              : 'Ouvir a sincronia ao vivo (muta o vídeo)'
        }
        side="top"
      >
        <IconButton
          size="sm"
          variant={previewEnabled ? 'accent' : 'outline'}
          onClick={onTogglePreview}
          disabled={!canPreview}
          aria-pressed={previewEnabled}
          aria-label="Preview de sincronia de áudio"
        >
          <Headphones />
        </IconButton>
      </Tooltip>

      <span className="font-code text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
        Sincronia
      </span>

      <button
        type="button"
        onClick={() => nudge(-STEP_GROSSO)}
        disabled={disabled || offsetMs <= MIN_MS}
        className="h-7 rounded-[var(--radius-xs)] border border-[var(--wb-border)] px-1.5 font-code text-[11px] text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
        aria-label="Adiantar áudio 100ms"
      >
        −100
      </button>
      <button
        type="button"
        onClick={() => nudge(-STEP_FINO)}
        disabled={disabled || offsetMs <= MIN_MS}
        className="h-7 rounded-[var(--radius-xs)] border border-[var(--wb-border)] px-1.5 font-code text-[11px] text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
        aria-label="Adiantar áudio 10ms"
      >
        −10
      </button>

      <span
        className={cn(
          'min-w-[64px] text-center font-code text-[12px] font-bold tabular-nums',
          offsetMs === 0 ? 'text-[var(--wb-text-dim)]' : 'text-[var(--wb-accent)]',
        )}
      >
        {rotulo}
      </span>

      <button
        type="button"
        onClick={() => nudge(STEP_FINO)}
        disabled={disabled || offsetMs >= MAX_MS}
        className="h-7 rounded-[var(--radius-xs)] border border-[var(--wb-border)] px-1.5 font-code text-[11px] text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
        aria-label="Atrasar áudio 10ms"
      >
        +10
      </button>
      <button
        type="button"
        onClick={() => nudge(STEP_GROSSO)}
        disabled={disabled || offsetMs >= MAX_MS}
        className="h-7 rounded-[var(--radius-xs)] border border-[var(--wb-border)] px-1.5 font-code text-[11px] text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-45"
        aria-label="Atrasar áudio 100ms"
      >
        +100
      </button>

      <input
        type="range"
        min={MIN_MS}
        max={MAX_MS}
        step={STEP_FINO}
        value={offsetMs}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        disabled={disabled}
        aria-label="Offset de áudio em milissegundos"
        className="mx-1 h-1 flex-1 cursor-pointer accent-[var(--wb-accent)]"
      />

      <Tooltip label="Zerar offset" side="top">
        <IconButton
          size="sm"
          variant="ghost"
          onClick={() => onChange(0)}
          disabled={disabled || offsetMs === 0}
          aria-label="Zerar offset de áudio"
        >
          <RotateCcw />
        </IconButton>
      </Tooltip>
    </div>
  );
}
