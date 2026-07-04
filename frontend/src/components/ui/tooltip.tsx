import * as React from 'react';
import * as RT from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = RT.Provider;
export const TooltipRoot = RT.Root;
export const TooltipTrigger = RT.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof RT.Content>,
  React.ComponentPropsWithoutRef<typeof RT.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <RT.Portal>
    <RT.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-[var(--radius-sm)] glass border border-[var(--wb-border)] px-2.5 py-1.5 text-xs text-[var(--wb-text)] shadow-lg',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
        className,
      )}
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
