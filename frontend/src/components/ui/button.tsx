import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

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
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
