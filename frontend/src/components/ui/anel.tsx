import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { percentualValido } from './progresso';

// D-1121 (E-069 H-11a) · Anel: uma proporção como widget (nota da IA, "7/8 etapas").
//
// `conic-gradient` recortado por máscara radial, tudo em CSS: só `--p` (0 a 100), `--d`
// (diâmetro) e `--t` (espessura) mudam por uso. O anel é REFORÇO: sem o número ou a frase
// dentro dele não diz nada, então `rotulo` é obrigatório e o conteúdo é o número.
// Sem o feixe: o anel "do resumo" no feixe é da H-15, que cria o lugar dele (§3.1).

export const COR_DO_ANEL = ['iris', 'aviso', 'ok', 'info', 'erro'] as const;
export type CorDoAnel = (typeof COR_DO_ANEL)[number];

const MASCARA =
  'before:[mask:radial-gradient(farthest-side,transparent_calc(100%-var(--t)),#000_calc(100%-var(--t)+.6px))] before:[-webkit-mask:radial-gradient(farthest-side,transparent_calc(100%-var(--t)),#000_calc(100%-var(--t)+.6px))]';

const anelVariants = cva(
  [
    'relative inline-grid size-[var(--d)] flex-none place-items-center rounded-full',
    'before:absolute before:inset-0 before:rounded-full before:content-[""]',
    'before:[background:conic-gradient(var(--c)_calc(var(--p)*1%),var(--cc-fio-2)_0)]',
    MASCARA,
  ],
  {
    variants: {
      cor: {
        iris: '[--c:var(--cc-iris)]',
        aviso: '[--c:var(--cc-aviso)]',
        ok: '[--c:var(--cc-ok)]',
        info: '[--c:var(--cc-info)]',
        erro: '[--c:var(--cc-erro)]',
      },
    },
    defaultVariants: { cor: 'iris' },
  },
);

export interface AnelProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 0 a 100. */
  valor: number;
  /** Lido pelo leitor de tela ("Nota da IA: 24 de 30"): o anel por si só não é texto. */
  rotulo: string;
  cor?: CorDoAnel;
  /** Diâmetro em px: 34 na linha, 30 na barra de ação, 46 a 96 nos resumos. */
  tamanho?: number;
  /** Espessura do traço em px: 3 na linha, 5 a 7 nos resumos. */
  espessura?: number;
  /** O número (ou o visto) no miolo. */
  children?: React.ReactNode;
}

export const Anel = React.forwardRef<HTMLSpanElement, AnelProps>(function Anel(
  { valor, rotulo, cor = 'iris', tamanho = 44, espessura = 4, className, children, ...props },
  ref,
) {
  const geometria = {
    '--p': percentualValido(valor),
    '--d': `${tamanho}px`,
    '--t': `${espessura}px`,
  } as React.CSSProperties;
  return (
    <span
      ref={ref}
      role="img"
      aria-label={rotulo}
      data-cor={cor}
      style={geometria}
      className={cn(anelVariants({ cor }), className)}
      {...props}
    >
      {/* O miolo fica acima do `::before`; a leitura é o `aria-label`, não este texto. */}
      <span aria-hidden className="relative inline-flex items-center justify-center">
        {children}
      </span>
    </span>
  );
});
