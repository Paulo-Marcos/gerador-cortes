import { Headphones, Loader2, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { EstadoLipSync } from '@/hooks/useLipSyncPreview';
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
//
// D-601: o protótipo desta faixa não previa o toggle de preview ao vivo, e a
// tradução fiel deixou o operador ajustando ms às cegas — com VITE_WORKBENCH=1
// o legado não é mais alcançável, então NÃO havia como ouvir o offset antes de
// um render inteiro. O ícone de fone que já abria a faixa vira o próprio
// interruptor do preview, em vez de um enfeite ao lado do rótulo.
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
  /** D-601: em que pé está o preview. Decodificar o áudio do corte leva ~7s, e
   *  um botão aceso que ainda não toca nada é indistinguível de um botão
   *  quebrado — foi assim que a sincronia pareceu morta por meses. */
  previewEstado?: EstadoLipSync;
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
  previewEstado = 'desligado',
  disabled,
  variant = 'legacy',
  onClose,
}: Props) {
  const clamp = (v: number) => Math.max(MIN_MS, Math.min(MAX_MS, Math.round(v)));
  const nudge = (delta: number) => onChange(clamp(offsetMs + delta));
  const rotulo = `${offsetMs > 0 ? '+' : ''}${offsetMs} ms`;

  const carregando = previewEnabled && previewEstado === 'carregando';
  const falhou = previewEnabled && previewEstado === 'erro';
  const IconePreview = carregando ? Loader2 : falhou ? TriangleAlert : Headphones;
  const dicaDoPreview = !canPreview
    ? 'Áudio do corte ainda não disponível para preview'
    : carregando
      ? 'Preparando o áudio do corte (alguns segundos)…'
      : falhou
        ? 'Não foi possível carregar o áudio do corte'
        : previewEnabled
          ? 'Preview ligado: ouvindo o áudio deslocado (vídeo mudo)'
          : 'Ouvir a sincronia ao vivo (muta o vídeo)';

  if (variant === 'workbench') {
    return (
      <div className="flex flex-none flex-wrap items-center gap-2 rounded-[10px] border border-[var(--wb-accent)] bg-[var(--wb-bg-panel)] px-2.5 py-[7px]">
        <Tooltip label={dicaDoPreview} side="top">
          <button
            type="button"
            onClick={onTogglePreview}
            disabled={!canPreview || !onTogglePreview}
            aria-pressed={previewEnabled}
            aria-label="Preview de sincronia de áudio"
            className={cn(
              'flex h-6 w-6 flex-none items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-45',
              falhou
                ? 'border-[var(--wb-danger,#e5484d)] bg-[var(--wb-bg-inset)] text-[var(--wb-danger,#e5484d)]'
                : previewEnabled
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-bg-panel)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
            )}
          >
            <IconePreview size={13} className={cn(carregando && 'animate-spin')} aria-hidden />
          </button>
        </Tooltip>
        <span className="font-code text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
          {carregando ? 'Preparando o áudio…' : falhou ? 'Áudio indisponível' : 'Sincronia do áudio'}
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
      <Tooltip label={dicaDoPreview} side="top">
        <IconButton
          size="sm"
          variant={previewEnabled ? 'accent' : 'outline'}
          onClick={onTogglePreview}
          disabled={!canPreview}
          aria-pressed={previewEnabled}
          aria-label="Preview de sincronia de áudio"
        >
          <IconePreview className={cn(carregando && 'animate-spin')} />
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
