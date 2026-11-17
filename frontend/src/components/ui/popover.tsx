import * as React from 'react';
import * as RP from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { containerDoPortal } from '@/lib/containerDoPortal';
import { MOVIMENTO_FLUTUANTE, PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';

// D-1122 (E-069 H-11b): o popover da Sala escura, sobre o Popover do Radix — abre no
// gatilho, fecha com Esc ou clique fora e devolve o foco ao gatilho. Para conteúdo
// que se lê (o medidor de etapas, uma ajuda): o que se escolhe vai no `Menu`.

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAncora = RP.Anchor;
export const PopoverFechar = RP.Close;

interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof RP.Content> {
  /** `false` desenha no lugar, sem portal — só para o teste em servidor. */
  portal?: boolean;
}

export const PopoverContent = React.forwardRef<React.ElementRef<typeof RP.Content>, PopoverContentProps>(
  ({ className, sideOffset = 8, align = 'center', portal = true, ...props }, ref) => {
    const conteudo = (
      <RP.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-[60] w-72 max-w-[calc(100vw-32px)] rounded-bloco p-4 text-corpo outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco focus-visible:-outline-offset-2',
          PELE_FLUTUANTE,
          MOVIMENTO_FLUTUANTE,
          className,
        )}
        {...props}
      />
    );
    return portal ? <RP.Portal container={containerDoPortal()}>{conteudo}</RP.Portal> : conteudo;
  },
);
PopoverContent.displayName = 'PopoverContent';
