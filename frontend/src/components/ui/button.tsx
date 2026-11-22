import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// D-1114 (E-069 H-07): o botão da Sala escura, a "pílula de luz". As variantes têm nome em
// português (`primario`, `secundario`, `fantasma`, `destrutivo`, `destrutivo-cheio`, `icone`)
// e não usam `backdrop-filter` (DIRECAO §3.6: o desfoque é da casca, o botão aparece em
// dezenas por tela). D-1191 (H-24c): o contrato antigo (`default`/`outline`/`ghost`/
// `danger`/`secondary`, `btn*` do D-599) saiu junto com o `upgrade.css`.

// Luz, não relevo (ADR-0018): nenhuma aresta dura embaixo. Apertar é `transform`, que
// não participa do layout — o botão ao lado não se mexe.
const BASE_DE_LUZ =
  'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-pilula border font-semibold leading-none ' +
  'transition-[background-color,border-color,box-shadow,filter,transform] duration-150 ' +
  'active:scale-[.97] active:duration-[120ms] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco ' +
  'disabled:cursor-not-allowed disabled:active:scale-100 aria-busy:cursor-progress ' +
  'motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:shrink-0';

const FEIXE_HOVER =
  'hover:brightness-[1.07] hover:saturate-[1.08] hover:shadow-[inset_0_1px_0_rgb(255_255_255/.6),0_14px_40px_-8px_var(--cc-feixe-brilho),0_0_0_4px_color-mix(in_srgb,var(--cc-feixe-brilho)_30%,transparent)]';
const FEIXE_ATIVO =
  'active:brightness-[.94] active:shadow-[inset_0_1px_0_rgb(255_255_255/.3),0_4px_14px_-8px_var(--cc-feixe-brilho)]';

export const botaoDeLuz = cva(BASE_DE_LUZ, {
  variants: {
    variante: {
      // O feixe: a única peça em degradê da tela.
      primario: cn(
        'border-transparent bg-feixe font-bold text-sobre-feixe shadow-feixe',
        FEIXE_HOVER,
        FEIXE_ATIVO,
        'disabled:border-fio disabled:bg-vidro disabled:bg-none disabled:text-fg-off disabled:shadow-none disabled:brightness-100 disabled:saturate-100',
        'aria-busy:brightness-[.92] aria-busy:saturate-[.75]',
      ),
      secundario: cn(
        'border-fio-2 bg-vidro-2 text-fg shadow-topo',
        'hover:border-[color-mix(in_srgb,var(--cc-fg)_30%,transparent)] hover:bg-vidro-3 active:bg-vidro',
        'aria-pressed:border-iris-fio aria-pressed:bg-iris-suave aria-pressed:text-iris-2',
        'disabled:border-fio disabled:bg-transparent disabled:text-fg-off disabled:shadow-none',
      ),
      fantasma: cn(
        'border-transparent bg-transparent text-fg-2',
        'hover:bg-vidro-2 hover:text-fg active:bg-vidro',
        'aria-pressed:bg-iris-suave aria-pressed:text-iris-2',
        'disabled:bg-transparent disabled:text-fg-off',
      ),
      destrutivo: cn(
        'border-[color-mix(in_srgb,var(--cc-erro)_34%,transparent)] bg-[color-mix(in_srgb,var(--cc-erro)_7%,transparent)] text-erro',
        'hover:border-[color-mix(in_srgb,var(--cc-erro)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--cc-erro)_16%,transparent)]',
        'disabled:border-fio disabled:bg-transparent disabled:text-fg-off',
      ),
      // Cheio só no confirmar do diálogo (DIRECAO §5).
      'destrutivo-cheio': cn(
        'border-transparent bg-erro-cheio font-bold text-sobre-erro shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_10px_26px_-12px_var(--cc-erro-cheio)]',
        'hover:brightness-[1.08]',
        'disabled:border-fio disabled:bg-transparent disabled:text-fg-off disabled:shadow-none disabled:brightness-100',
      ),
    },
    tamanho: {
      pq: 'h-botao-pq gap-1.5 px-3 text-pequeno',
      md: 'h-botao-md gap-2 px-4 text-corpo',
      gd: 'h-botao-gd gap-2.5 px-[22px] text-linha',
    },
    // Só ícone: círculo, largura = altura.
    soIcone: { true: 'aspect-square px-0', false: '' },
  },
  defaultVariants: { variante: 'secundario', tamanho: 'md', soIcone: false },
});

type VarianteDeLuz = NonNullable<VariantProps<typeof botaoDeLuz>['variante']> | 'icone';
type TamanhoDeLuz = NonNullable<VariantProps<typeof botaoDeLuz>['tamanho']>;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VarianteDeLuz;
  size?: TamanhoDeLuz;
  /** Círculo, largura = altura, para o botão que só tem ícone (D-1189). */
  soIcone?: boolean;
  asChild?: boolean;
  /**
   * Trabalhando: `aria-busy`, giro e o clique não faz nada. O texto vai no gerúndio com
   * reticências ("Publicando…"). Não usa `disabled` de propósito: o botão não some do
   * foco do teclado no meio da ação.
   */
  carregando?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'secundario', size = 'md', soIcone = false, asChild = false, carregando = false, onClick, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const classes = cn(
      botaoDeLuz({
        variante: variant === 'icone' ? 'secundario' : variant,
        tamanho: size,
        soIcone: soIcone || variant === 'icone',
      }),
      className,
    );

    return (
      <Comp
        className={classes}
        ref={ref}
        data-variant={variant}
        aria-busy={carregando || undefined}
        onClick={carregando ? (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault() : onClick}
        {...props}
      >
        {/* Com `asChild` o Slot exige UM filho: o giro não cabe ali. */}
        {asChild ? (
          children
        ) : (
          <>
            {carregando ? <GiroDeCarga /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

function GiroDeCarga() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[color-mix(in_srgb,currentColor_28%,transparent)] border-t-current motion-reduce:animate-none"
    />
  );
}
