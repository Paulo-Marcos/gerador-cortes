import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

// D-599: com a casca nova o botão passa a ser o `.btn` do handoff — 30 px,
// canto de 4 px, superfície de vidro. Não é troca de cor: é o MESMO botão
// que a tela de Componentes mostra, então tudo que usa `<Button>` (e é
// quase tudo) adota o padrão sem reescrever chamada por chamada.
const CASCA_NOVA = isUpgradeShellEnabled();

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
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[13px] [&_svg]:shrink-0',
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const classes = CASCA_NOVA
      ? cn(
          AP_VARIANTS[variant ?? 'default'] ?? AP_VARIANTS.default,
          AP_SIZES[size ?? 'default'],
          // `[&_svg]` continua: o tamanho do glifo é o mesmo nos dois mundos.
          '[&_svg]:size-[13px] [&_svg]:shrink-0',
          className,
        )
      : cn(buttonVariants({ variant, size, className }));

    return <Comp className={classes} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
