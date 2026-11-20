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
            data-sala=""
            className={cn(
              'flex h-7 w-7 flex-none items-center justify-center rounded-pilula border transition-colors duration-150 disabled:pointer-events-none disabled:border-fio disabled:text-fg-off motion-reduce:transition-none',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
              falhou
                ? 'border-erro bg-poco text-erro'
                : previewEnabled
                  ? 'border-iris-fio bg-iris-suave text-iris-2'
                  : 'border-fio-2 bg-poco text-fg-3 hover:text-fg',
            )}
          >
            <Icon name={iconePreview} className={cn(carregando && 'animate-spin')} />
          </button>
        </Tooltip>
        <span className="text-micro font-semibold text-fg-2">
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
            data-sala=""
            className="h-8 min-w-[44px] flex-1 rounded-pilula border border-fio-2 bg-transparent font-mono text-pequeno tabular-nums text-fg transition-colors duration-150 hover:bg-vidro-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:pointer-events-none disabled:border-fio disabled:text-fg-off motion-reduce:transition-none"
            aria-label={dica}
          >
            {rotulo}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}
