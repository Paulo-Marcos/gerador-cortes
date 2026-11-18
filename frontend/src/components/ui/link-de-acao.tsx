import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

export interface LinkDeAcaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Para o texto virar um `<a>`/`<Link>` sem perder o desenho. */
  asChild?: boolean;
}

/**
 * A ação de linha (DIRECAO §5, nível 4): texto em `iris`, nunca um botão. Uma por item
 * de lista — "Editar", "Trazer de volta". Quando há mais de uma, o resto vai para o "⋯".
 */
export const LinkDeAcao = React.forwardRef<HTMLButtonElement, LinkDeAcaoProps>(
  ({ className, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        {...(asChild ? {} : { type })}
        data-variant="link-de-acao"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border-0 bg-transparent py-1 text-corpo font-semibold text-iris transition-colors duration-150',
          'hover:text-iris-2 hover:underline hover:underline-offset-[3px]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
          'disabled:cursor-not-allowed disabled:text-fg-off disabled:no-underline motion-reduce:transition-none',
          className,
        )}
        {...props}
      />
    );
  },
);
LinkDeAcao.displayName = 'LinkDeAcao';
