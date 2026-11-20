import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────
// D-746 · a moldura de verdade: três camadas, e nenhuma delas é a borda.
//   1. PASSE-PARTOUT (`bg-poco`): a superfície atrás da arte, que separa "a live"
//      do cartão que fala dela;
//   2. BISEL: fio externo `fio-2` + um fio de 1 px no topo interno, para a imagem
//      parecer montada, não colada;
//   3. VINHETA inferior: a arte de live vem cheia de texto e cor alta; sem ela os
//      selos sobrepostos perdem contraste em metade das miniaturas.
//
// D-1144 (E-069 H-14): a roupa passa a ser classe do Tailwind e token da Sala escura. O
// passe-partout (`--respiro`) é a única geometria de execução, e vai em variável CSS. Esta
// peça é exceção nomeada das catracas de cor (DIRECAO §9): ela pinta por cima do vídeo.
// ─────────────────────────────────────────────────────────────────

export function MolduraDeVideo({
  proporcao = '16/9',
  children,
  onClick,
  rotulo,
  mat = 8,
}: {
  proporcao?: string;
  children?: ReactNode;
  onClick?: () => void;
  /** aria-label — obrigatório quando a moldura é clicável. */
  rotulo?: string;
  /** Largura do passe-partout. 8px no card, 4px na linha de corte. */
  mat?: number;
}) {
  const Quadro = onClick ? 'button' : 'span';
  const geometria = { '--respiro': `${mat}px`, '--proporcao': proporcao.replace('/', ' / ') } as CSSProperties;
  return (
    <span style={geometria} className="block rounded-[14px] bg-poco p-[var(--respiro)]">
      <Quadro
        {...(onClick
          ? { type: 'button' as const, onClick, 'aria-label': rotulo, 'data-sala': '' }
          : { 'aria-hidden': true })}
        className={cn(
          'relative block aspect-[var(--proporcao)] w-full overflow-hidden rounded-[10px] border-0 bg-poco p-0 shadow-[0_0_0_1px_var(--cc-fio-2),0_10px_20px_-12px_rgb(8_12_22/.7)]',
          onClick &&
            'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        )}
      >
        {children}
        {/* Bisel + vinheta. Ficam por cima de tudo e não interceptam clique. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgb(255_255_255/.24),inset_0_0_0_1px_rgb(8_12_22/.28),inset_0_-30px_40px_-26px_rgb(8_12_22/.75)]"
        />
      </Quadro>
    </span>
  );
}
