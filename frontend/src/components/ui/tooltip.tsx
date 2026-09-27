import * as React from 'react';
import * as RT from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = RT.Provider;
export const TooltipRoot = RT.Root;
export const TooltipTrigger = RT.Trigger;

// D-599: o tooltip é renderizado num PORTAL, e portal para o <body> sai de
// dentro da casca `.ap` — onde moram o tema claro/escuro e a ponte de tokens.
// Sem isto a dica nascia com os valores de `:root` e podia sair CLARA numa casca
// escura. Com a casca ligada o portal passa a apontar para o próprio `.ap`, e a
// dica herda o tema como qualquer outra peça da tela.

function containerDoPortal(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLElement>('.ap') ?? undefined;
}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof RT.Content>,
  React.ComponentPropsWithoutRef<typeof RT.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <RT.Portal container={containerDoPortal()}>
    <RT.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'card z-[70] overflow-hidden px-2 py-1 text-[11.5px] text-[var(--ink)]',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
        className,
      )}
      style={{ borderRadius: 'var(--r1)' }}
      {...props}
    />
  </RT.Portal>
));
TooltipContent.displayName = 'TooltipContent';

interface TooltipProps {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

export function Tooltip({ label, children, side = 'right', delayDuration = 150 }: TooltipProps) {
  return (
    <RT.Root delayDuration={delayDuration}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </RT.Root>
  );
}
