import { cn } from '@/lib/utils';
import { segParaMmSs } from '../timeUtils';

// D-1164 (E-069 H-18) · "onde estou" na linha do tempo da Pós (DIRECAO §3.1, §3.3, §7.4).
//
// Dois lugares do feixe moram aqui, e este é o único arquivo da Pós isento na catraca
// `feixeSoNoLugar`: o rótulo da agulha (o tempo no corte) e o traço da cena sob a agulha.
// O resto da linha do tempo não usa o feixe.

/** O traço no pé do bloco da cena que está sob a agulha: a "atual", no feixe. */
export const TRACO_DA_CENA_ATUAL =
  'data-[atual]:after:absolute data-[atual]:after:inset-x-0 data-[atual]:after:bottom-0 data-[atual]:after:h-[3px] data-[atual]:after:bg-feixe data-[atual]:after:content-[""]';

/** Onde a agulha fica, em % da duração: as bordas de 1 px da pista entram na conta (`--x` é 0 a 1). */
export const POSICAO_DA_AGULHA = 'left-[calc(85px+(100%-86px)*var(--x))]';

interface AgulhaProps {
  /** Posição da agulha, de 0 a 1. */
  fracao: number;
  tempoSeg: number;
  arrastando: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

/** A agulha: traço claro de cima a baixo das pistas e o rótulo em pílula no feixe. */
export function AgulhaDaPos({ fracao, tempoSeg, arrastando, onPointerDown }: AgulhaProps) {
  return (
    <div
      aria-hidden
      data-testid="agulha-da-pos"
      data-sala=""
      onPointerDown={onPointerDown}
      style={{ '--x': fracao } as React.CSSProperties}
      className={cn(
        'absolute bottom-[22px] top-0 z-30 w-3 -translate-x-1/2 cursor-ew-resize',
        POSICAO_DA_AGULHA,
      )}
    >
      <span className="absolute left-1/2 top-0 w-0.5 -translate-x-1/2 bg-foco h-full" />
      <span
        className={cn(
          'num text-micro absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-pilula bg-feixe px-1.5 text-sobre-feixe',
          arrastando && 'shadow-pop',
        )}
      >
        {segParaMmSs(tempoSeg)}
      </span>
    </div>
  );
}
