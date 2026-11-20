import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { segParaMmSs } from '../timeUtils';
import type { DecisaoSegmentoDetectado, SegmentoDetectado } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Icon } from '@/upgrade/Icon';
import { FOCO } from '../salaDoEditor';

// F-054: popover ancorado num ponto da timeline, mostrando as 3 opções neutras
// (Rejeitar / FULL / Compartilhada) lado a lado. Sem pré-seleção — decisão
// de produto: UI previsível, sem "mágica". Esc ou click fora fecha sem decidir.

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
      // Centraliza horizontalmente no ponto âncora e sobe um pouco pra não
      // tampar o segmento. O parent é position:relative — left/top em px.
      className="absolute left-[var(--x)] top-[var(--y)] z-[60] flex min-w-60 -translate-x-1/2 -translate-y-full flex-col gap-2 rounded-bloco border border-fio-2 bg-painel-solido p-2 shadow-pop-luz"
      style={{ '--x': `${anchor.left}px`, '--y': `${anchor.top}px` } as CSSProperties}
    >
      <header className="flex items-center gap-1.5">
        <span className="text-micro text-fg-3">Segmento detectado</span>
        <span className="num text-micro text-fg-2">
          · {segParaMmSs(segmento.inicio, true)} → {segParaMmSs(segmento.fim, true)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          data-sala=""
          aria-label="Fechar"
          onClick={onFechar}
          className={cn(
            'flex size-6 items-center justify-center rounded-pilula text-fg-2 transition-colors duration-150 hover:bg-vidro-2 hover:text-fg motion-reduce:transition-none',
            FOCO,
          )}
        >
          <Icon name="x" />
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

// A cor diz a decisão: erro rejeita, íris é o FULL (era o violeta), info é a compartilhada.
const TOM_DA_DECISAO = {
  err: 'border-erro/45 bg-erro/[.13] text-erro',
  violet: 'border-iris-fio bg-iris-suave text-iris-2',
  info: 'border-info/45 bg-info/[.13] text-info',
} as const;

function DecisaoButton({
  tone,
  label,
  disabled,
  onClick,
}: {
  tone: keyof typeof TOM_DA_DECISAO;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secundario"
      size="pq"
      onClick={onClick}
      disabled={disabled}
      className={cn('w-full px-2 shadow-none disabled:cursor-wait', TOM_DA_DECISAO[tone])}
    >
      {label}
    </Button>
  );
}
