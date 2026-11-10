import type { ReactNode } from 'react';
import type { EstadoLipSync } from '@/hooks/useLipSyncPreview';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────
// AudioSyncControl (F-063) — ajuste fino de lip-sync por corte.
// Nudge ± do offset (ms) + toggle de preview ao vivo.
// O valor é "dirty" no EditorPage; só persiste no Salvar e aplica no render.
//
// D-1095: virou o corpo da pergunta 3 da aba Decisões ("O som bate com a
// boca?"). O número foi para o cabeçalho da pergunta; a régua e o resetar
// saíram (decisão do Paulo, 10/11/2026): os quatro passos e Ctrl+, / Ctrl+.
// cobrem o ajuste.
//
// D-601: o protótipo desta faixa não previa o toggle de preview ao vivo, e a
// tradução fiel deixou o operador ajustando ms às cegas — sem ele NÃO havia
// como ouvir o offset antes de um render inteiro. O ícone de fone é o próprio
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
  /** Vai no fim da linha dos passos (o "Está certo" da pergunta). */
  children?: ReactNode;
}

const PASSOS = [
  { delta: -STEP_GROSSO, rotulo: '−100', dica: 'Adiantar áudio 100ms' },
  { delta: -STEP_FINO, rotulo: '−10', dica: 'Adiantar áudio 10ms' },
  { delta: STEP_FINO, rotulo: '+10', dica: 'Atrasar áudio 10ms' },
  { delta: STEP_GROSSO, rotulo: '+100', dica: 'Atrasar áudio 100ms' },
];

export function AudioSyncControl({
  offsetMs,
  onChange,
  previewEnabled = false,
  onTogglePreview,
  canPreview = true,
  previewEstado = 'desligado',
  disabled,
  children,
}: Props) {
  const clamp = (v: number) => Math.max(MIN_MS, Math.min(MAX_MS, Math.round(v)));

  const carregando = previewEnabled && previewEstado === 'carregando';
  const falhou = previewEnabled && previewEstado === 'erro';
  const iconePreview = carregando ? 'loader-2' : falhou ? 'triangle-alert' : 'headphones';
  const dicaDoPreview = !canPreview
    ? 'Áudio do corte ainda não disponível para preview'
    : carregando
      ? 'Preparando o áudio do corte (alguns segundos)…'
      : falhou
        ? 'Não foi possível carregar o áudio do corte'
        : previewEnabled
          ? 'Preview ligado: ouvindo o áudio deslocado (vídeo mudo)'
          : 'Ouvir a sincronia ao vivo (muta o vídeo)';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Tooltip label={dicaDoPreview} side="top">
          <button
            type="button"
            onClick={onTogglePreview}
            disabled={!canPreview || !onTogglePreview}
            aria-pressed={previewEnabled}
            aria-label="Preview de sincronia de áudio"
            className={cn(
              'flex h-7 w-7 flex-none items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-45',
              falhou
                ? 'border-[var(--wb-err)] bg-[var(--wb-bg-inset)] text-[var(--wb-err)]'
                : previewEnabled
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-bg-panel)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
            )}
          >
            <Icon name={iconePreview} className={cn(carregando && 'animate-spin')} />
          </button>
        </Tooltip>
        <span className="text-[11px] font-semibold text-[var(--wb-text-mute)]">
          {carregando ? 'Preparando o áudio…' : falhou ? 'Áudio indisponível' : 'Sincronia do áudio'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PASSOS.map(({ delta, rotulo, dica }) => (
          <button
            key={delta}
            type="button"
            onClick={() => onChange(clamp(offsetMs + delta))}
            disabled={disabled || (delta < 0 ? offsetMs <= MIN_MS : offsetMs >= MAX_MS)}
            className="h-8 min-w-[44px] flex-1 rounded-[8px] border border-[var(--wb-border)] bg-transparent font-code text-[12px] font-semibold text-[var(--wb-text)] transition-colors hover:bg-[var(--wb-bg-inset)] disabled:pointer-events-none disabled:opacity-40"
            aria-label={dica}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {rotulo}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}
