import * as React from 'react';
import * as RT from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { containerDoPortal } from '@/lib/containerDoPortal';
import { MOVIMENTO_FLUTUANTE, PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';

export const TooltipProvider = RT.Provider;
export const TooltipRoot = RT.Root;
export const TooltipTrigger = RT.Trigger;

// D-1122 (E-069 H-11b): a dica da Sala escura — ladrilho de 9 px, fio `fio-2`, texto de
// 12 px. O portal, a casca `.ap` e o tema seguem como na D-599 (`containerDoPortal`).
// A dica nomeia o botão só de ícone; ela nunca é o único lugar de uma informação, porque
// no toque não há hover.

interface TooltipContentProps extends React.ComponentPropsWithoutRef<typeof RT.Content> {
  /** `false` desenha no lugar, sem portal — só para o teste em servidor. */
  portal?: boolean;
}

export const TooltipContent = React.forwardRef<React.ElementRef<typeof RT.Content>, TooltipContentProps>(
  ({ className, sideOffset = 6, portal = true, ...props }, ref) => {
    const conteudo = (
      <RT.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-[70] max-w-[280px] rounded-ladrilho px-2.5 py-1.5 text-pequeno',
          PELE_FLUTUANTE,
          MOVIMENTO_FLUTUANTE,
          className,
        )}
        {...props}
      />
    );
    return portal ? <RT.Portal container={containerDoPortal()}>{conteudo}</RT.Portal> : conteudo;
  },
);
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
