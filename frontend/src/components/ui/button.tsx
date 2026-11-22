import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// D-1114 (E-069 H-07): o botão da Sala escura, a "pílula de luz", mora aqui ao lado do
// legado. As cinco variantes antigas (`default`, `outline`, `ghost`, `danger`,
// `secondary`) seguem desenhadas pelo `.btn*` do D-599: é o mapa que mantém cada tela
// atual igual. As variantes novas têm nome em português (`primario`, `secundario`,
// `fantasma`, `destrutivo`, `destrutivo-cheio`, `icone`) e não usam `backdrop-filter`
// (DIRECAO §3.6: o desfoque é da casca, o botão aparece em dezenas por tela).
//
// D-599: com a casca nova o botão passa a ser o `.btn` do handoff — 30 px,
// canto de 4 px, superfície de vidro. Não é troca de cor: é o MESMO botão
// que a tela de Componentes mostra, então tudo que usa `<Button>` (e é
// quase tudo) adota o padrão sem reescrever chamada por chamada.

const AP_VARIANTS: Record<string, string> = {
  default: 'btn btn-pri',
  outline: 'btn',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
  secondary: 'btn btn-soft',
};

const AP_SIZES: Record<string, string> = {
  default: '',
  sm: 'btn-sm',
  icon: 'btn-icon',
  'icon-sm': 'btn-icon btn-sm',
};

// Proporções do protótipo Workbench 1c (D-395/validação 3): botões
// menores e mais densos — fonte 10.5–11.5px bold, raio 8–9px, padding
// 6–7px×12–14px. `default` usa --wb-accent-fg (não branco fixo) para
// respeitar a paleta ativa.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-[var(--wb-accent)] text-[var(--wb-accent-fg)] hover:opacity-90 active:opacity-100',
        outline:
          'border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text)] hover:border-[var(--wb-text-dim)] hover:bg-[var(--wb-bg-card-elev)]',
        ghost:
          'border border-transparent bg-transparent text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
        danger:
          'border border-transparent bg-transparent text-[var(--wb-text-mute)] hover:bg-error/10 hover:text-error',
        secondary:
          'border border-transparent bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      },
      size: {
        default: 'h-8 px-3.5 text-[11.5px]',
        sm: 'h-7 px-3 text-[10.5px]',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);


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

type VarianteLegada = 'default' | 'outline' | 'ghost' | 'danger' | 'secondary';
type VarianteDeLuz = NonNullable<VariantProps<typeof botaoDeLuz>['variante']> | 'icone';
type TamanhoLegado = 'default' | 'sm' | 'icon' | 'icon-sm';
type TamanhoDeLuz = NonNullable<VariantProps<typeof botaoDeLuz>['tamanho']>;

/** Como cada tamanho do contrato antigo se lê na escala de 30 / 38 / 46 px. */
const TAMANHO_LEGADO_NA_ESCALA_NOVA: Record<TamanhoLegado, [TamanhoDeLuz, boolean]> = {
  default: ['md', false],
  sm: ['pq', false],
  icon: ['md', true],
  'icon-sm': ['pq', true],
};

const LEGADAS = new Set<string>(Object.keys(AP_VARIANTS));

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VarianteLegada | VarianteDeLuz;
  size?: TamanhoLegado | TamanhoDeLuz;
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

function classesDoLegado(variant: VarianteLegada, size: TamanhoLegado | TamanhoDeLuz) {
  return cn(
    AP_VARIANTS[variant] ?? AP_VARIANTS.default,
    AP_SIZES[size] ?? '',
    // `[&_svg]` continua: o tamanho do glifo é o mesmo nos dois mundos.
    // D-853: 16 px, o degrau de botão da escala do Icon (era 13, fora dela).
    '[&_svg]:size-4 [&_svg]:shrink-0',
  );
}

function classesDeLuz(variant: VarianteDeLuz, size: TamanhoLegado | TamanhoDeLuz, soIcone: boolean) {
  const [tamanho, daEscalaAntiga] =
    size in TAMANHO_LEGADO_NA_ESCALA_NOVA
      ? TAMANHO_LEGADO_NA_ESCALA_NOVA[size as TamanhoLegado]
      : [size as TamanhoDeLuz, false];
  return botaoDeLuz({
    variante: variant === 'icone' ? 'secundario' : variant,
    tamanho,
    soIcone: soIcone || variant === 'icone' || daEscalaAntiga,
  });
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'default', soIcone = false, asChild = false, carregando = false, onClick, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const classes = cn(
      LEGADAS.has(variant)
        ? classesDoLegado(variant as VarianteLegada, size)
        : classesDeLuz(variant as VarianteDeLuz, size, soIcone),
      className,
    );

    return (
      <Comp
        className={classes}
        ref={ref}
        data-variant={variant}
        data-sala={LEGADAS.has(variant) ? undefined : ''}
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

export { buttonVariants };
