import * as React from 'react';
import * as RM from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { containerDoPortal } from '@/lib/containerDoPortal';
import { Icon, type IconName } from '@/components/ui/icon';
import { MOVIMENTO_FLUTUANTE, PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';

// D-1122 (E-069 H-11b): o menu da Sala escura, sobre o Dropdown Menu do Radix — que
// entrega o teclado (setas, Home/End, digitar para saltar, Esc) e devolve o foco ao
// gatilho. Aqui entra só a roupa e uma regra de acessibilidade que o Radix não cumpre
// do jeito que o app precisa: item desligado é `aria-disabled`, não `disabled`.

export const Menu = RM.Root;
export const MenuTrigger = RM.Trigger;
export const MenuGrupo = RM.Group;

/** Painel do menu: cartão de 16 px de raio, 6 px de respiro, itens de 34 px. */
export const PAINEL_DO_MENU =
  'z-[60] flex min-w-[220px] flex-col gap-px rounded-bloco p-1.5 outline-none ' + PELE_FLUTUANTE;

/** Item do menu: ladrilho de 10 px, 34 px de altura. Compartilhado com o `OverflowMenu`. */
export const ITEM_DO_MENU =
  'flex h-[34px] w-full cursor-default select-none items-center gap-2.5 rounded-[10px] px-2.5 text-left text-corpo font-medium text-fg outline-none ' +
  'transition-colors duration-150 motion-reduce:transition-none ' +
  'hover:bg-vidro-2 data-[highlighted]:bg-vidro-2 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco ' +
  'aria-disabled:cursor-not-allowed aria-disabled:text-fg-off aria-disabled:hover:bg-transparent aria-disabled:data-[highlighted]:bg-transparent';

export const ITEM_DO_MENU_PERIGOSO =
  'text-erro hover:bg-[color-mix(in_srgb,var(--cc-erro)_14%,transparent)] data-[highlighted]:bg-[color-mix(in_srgb,var(--cc-erro)_14%,transparent)]';

interface MenuContentProps extends React.ComponentPropsWithoutRef<typeof RM.Content> {
  /** `false` desenha no lugar, sem portal — só para o teste em servidor. */
  portal?: boolean;
}

export const MenuContent = React.forwardRef<React.ElementRef<typeof RM.Content>, MenuContentProps>(
  ({ className, sideOffset = 6, align = 'start', portal = true, ...props }, ref) => {
    const conteudo = (
      <RM.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(PAINEL_DO_MENU, MOVIMENTO_FLUTUANTE, className)}
        {...props}
      />
    );
    return portal ? <RM.Portal container={containerDoPortal()}>{conteudo}</RM.Portal> : conteudo;
  },
);
MenuContent.displayName = 'MenuContent';

export interface MenuItemProps extends Omit<React.ComponentPropsWithoutRef<typeof RM.Item>, 'disabled'> {
  icone?: IconName;
  /** A tecla de atalho, à direita. */
  atalho?: string;
  /** Ação destrutiva: texto em `erro`. */
  perigo?: boolean;
  /**
   * Desligado por `aria-disabled`: o item segue alcançável pelo teclado e o `title` (o
   * motivo) aparece no hover — `disabled` de verdade engole o foco e o motivo some (D-439).
   */
  desligado?: boolean;
}

/** Item desligado não age e não fecha o menu; o ligado segue o caminho do Radix. */
export function aoEscolherItem(
  desligado: boolean | undefined,
  evento: Pick<Event, 'preventDefault'>,
  aoEscolher?: (evento: Event) => void,
): void {
  if (desligado) {
    evento.preventDefault();
    return;
  }
  aoEscolher?.(evento as Event);
}

export const MenuItem = React.forwardRef<React.ElementRef<typeof RM.Item>, MenuItemProps>(
  ({ className, icone, atalho, perigo, desligado, onSelect, children, ...props }, ref) => (
    <RM.Item
      ref={ref}
      aria-disabled={desligado || undefined}
      onSelect={(evento) => aoEscolherItem(desligado, evento, onSelect)}
      className={cn(ITEM_DO_MENU, perigo && ITEM_DO_MENU_PERIGOSO, className)}
      {...props}
    >
      {icone && <Icon name={icone} className={perigo ? 'text-erro' : 'text-fg-3'} />}
      <span className="flex-1">{children}</span>
      {atalho && <span className="font-mono text-micro text-fg-3">{atalho}</span>}
    </RM.Item>
  ),
);
MenuItem.displayName = 'MenuItem';

export const MenuRotulo = React.forwardRef<
  React.ElementRef<typeof RM.Label>,
  React.ComponentPropsWithoutRef<typeof RM.Label>
>(({ className, ...props }, ref) => (
  <RM.Label ref={ref} className={cn('px-2.5 pb-1 pt-2 text-micro text-fg-3', className)} {...props} />
));
MenuRotulo.displayName = 'MenuRotulo';

export const MenuSeparador = React.forwardRef<
  React.ElementRef<typeof RM.Separator>,
  React.ComponentPropsWithoutRef<typeof RM.Separator>
>(({ className, ...props }, ref) => (
  <RM.Separator ref={ref} className={cn('my-[5px] h-px w-full bg-fio', className)} {...props} />
));
MenuSeparador.displayName = 'MenuSeparador';
