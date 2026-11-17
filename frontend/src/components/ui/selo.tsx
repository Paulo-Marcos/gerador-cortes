import * as React from 'react';
import { cva } from 'class-variance-authority';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

// D-1117 (E-069 H-09) · Selo: DE QUEM É A VEZ NESTE ITEM. Um por item (DIRECAO §5).
//
// Seis tons, e cada um tem uma FORMA além da cor, para o estado sobreviver a
// monitor ruim e a quem não separa vermelho de verde:
//   inerte → anel · neutro → ponto · curso → giro · convite → ponto com halo ·
//   ok → visto · erro → losango.
// Redondo e plano de propósito: não parece apertável (quem se aperta é botão/chip).
// NUNCA usa a íris nem o feixe — íris e feixe são "ação" e "onde estou" (§3.1).
// Sem `backdrop-filter` (§3.6): o selo mora em linha de lista.
// A cor do tom é `--c` (como no sala-escura.css): fundo a 13% e fio a 22%, os valores em que o
// contraste da DIRECAO §8.1 foi medido; `--cc-info` direto porque o `text-info` do Tailwind ainda é o antigo.

export const TONS_DO_SELO = ['inerte', 'neutro', 'curso', 'convite', 'ok', 'erro'] as const;
export type TomDoSelo = (typeof TONS_DO_SELO)[number];

const seloVariants = cva(
  'inline-flex h-6 flex-none select-none items-center gap-1.5 whitespace-nowrap rounded-pilula border border-[color-mix(in_srgb,var(--c)_22%,transparent)] bg-[color-mix(in_srgb,var(--c)_13%,transparent)] py-0 pl-2 pr-2.5 text-[color:var(--c)] text-pequeno font-semibold leading-none',
  {
    variants: {
      tom: {
        inerte: '[--c:var(--cc-fg-3)]',
        neutro: '[--c:var(--cc-fg-2)]',
        curso: '[--c:var(--cc-info)]',
        convite: '[--c:var(--cc-aviso)]',
        ok: '[--c:var(--cc-ok)]',
        erro: '[--c:var(--cc-erro)]',
      },
    },
    defaultVariants: { tom: 'neutro' },
  },
);

const PONTO = 'size-[7px] flex-none rounded-full bg-current';

/** A marca de cada tom. É decorativa: o rótulo do selo já diz o estado em palavras. */
function Marca({ tom }: { tom: TomDoSelo }) {
  switch (tom) {
    case 'inerte':
      return <span aria-hidden data-marca="anel" className="size-[7px] flex-none rounded-full border-[1.5px] border-current" />;
    case 'curso':
      return (
        <span aria-hidden data-marca="giro" className="inline-flex flex-none"><Icon name="loader-2" className="size-3 flex-none animate-spin motion-reduce:animate-none" /></span>
      );
    case 'convite':
      return (
        <span
          aria-hidden
          data-marca="ponto-com-halo"
          className={cn(PONTO, 'shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_26%,transparent)]')}
        />
      );
    case 'ok':
      return <span aria-hidden data-marca="visto" className="inline-flex flex-none"><Icon name="check" className="size-3" /></span>;
    case 'erro':
      return <span aria-hidden data-marca="losango" className={cn(PONTO, 'rounded-[1.5px] rotate-45')} />;
    default:
      return <span aria-hidden data-marca="ponto" className={PONTO} />;
  }
}

export interface SeloProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'title'> {
  tom?: TomDoSelo;
  /** Vai para o `title`: o selo é curto, a explicação mora aqui. */
  dica?: string;
}

export const Selo = React.forwardRef<HTMLSpanElement, SeloProps>(function Selo(
  { tom = 'neutro', dica, className, children, ...props },
  ref,
) {
  return (
    <span ref={ref} title={dica} data-tom={tom} className={cn(seloVariants({ tom }), className)} {...props}>
      <Marca tom={tom} />
      {children}
    </span>
  );
});
