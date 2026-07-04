import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { segParaMmSs } from '../timeUtils';
import type { DecisaoSegmentoDetectado, SegmentoDetectado } from '@/types/models';

// F-054: popover ancorado num ponto da timeline, mostrando as 3 opções neutras
// (Rejeitar / FULL / Compartilhada) lado a lado. Sem pré-seleção — paulo
// pediu UI previsível, sem "mágica". Esc ou click fora fecha sem decidir.

interface Props {
  segmento: SegmentoDetectado;
  indice: number;
  /** Posição em px relativa ao container que ancora o popover. */
  anchor: { left: number; top: number };
  disabled?: boolean;
  onDecidir: (indice: number, decisao: DecisaoSegmentoDetectado) => void;
  onFechar: () => void;
}

export function SegmentoDetectadoPopover({
  segmento,
  indice,
  anchor,
  disabled = false,
  onDecidir,
  onFechar,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Esc fecha. Click fora também — listener global capturando no `mousedown`
  // pra fechar antes mesmo do botão da timeline reabrir o popover.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (e.target instanceof Node && containerRef.current.contains(e.target)) return;
      onFechar();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onFechar]);

  const decidir = (decisao: DecisaoSegmentoDetectado) => {
    if (disabled) return;
    onDecidir(indice, decisao);
    onFechar();
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Decidir segmento detectado"
      className="absolute z-[60] flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-lg"
      style={{
        left: anchor.left,
        top: anchor.top,
        // Centraliza horizontalmente no ponto âncora e sobe um pouco pra não
        // tampar o segmento. O parent é position:relative — left/top em px.
        transform: 'translate(-50%, -100%)',
        minWidth: 240,
      }}
    >
      <header className="flex items-center gap-1.5">
        <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
          Segmento detectado
        </span>
        <span className="font-code text-[10px] text-[var(--wb-text-mute)]">
          · {segParaMmSs(segmento.inicio, true)} → {segParaMmSs(segmento.fim, true)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Fechar"
          onClick={onFechar}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
        >
          <X size={11} />
        </button>
      </header>
      <div className="grid grid-cols-3 gap-1.5">
        <DecisaoButton
          tone="err"
          label="Rejeitar"
          onClick={() => decidir('rejeitar')}
          disabled={disabled}
        />
        <DecisaoButton
          tone="violet"
          label="FULL"
          onClick={() => decidir('full')}
          disabled={disabled}
        />
        <DecisaoButton
          tone="info"
          label="Compart."
          onClick={() => decidir('compartilhada')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function DecisaoButton({
  tone,
  label,
  disabled,
  onClick,
}: {
  tone: 'err' | 'violet' | 'info';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const toneMap = {
    err: { bg: 'var(--wb-err-soft)', text: 'var(--wb-err)', border: 'var(--wb-err)' },
    violet: { bg: 'var(--wb-violet-soft)', text: 'var(--wb-violet)', border: 'var(--wb-violet)' },
    info: { bg: 'var(--wb-info-soft)', text: 'var(--wb-info)', border: 'var(--wb-info)' },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center justify-center rounded-[var(--radius-xs)] border px-2 font-code text-[10px] font-extrabold uppercase tracking-[0.04em] transition-opacity disabled:cursor-wait disabled:opacity-50 hover:opacity-85',
      )}
      style={{
        background: toneMap.bg,
        color: toneMap.text,
        borderColor: `color-mix(in oklch, ${toneMap.border} 45%, transparent)`,
      }}
    >
      {label}
    </button>
  );
}
