import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1116 (E-069 H-08): `aparencia="sala"` é o rótulo da Sala escura (12/16, semibold,
// `fg-2`). O padrão `atual` fica até as telas migrarem (H-24 remove a ponte).
export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { aparencia?: 'atual' | 'sala' }
>(({ className, aparencia = 'atual', ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      aparencia === 'sala'
        ? 'text-xs font-semibold leading-4 text-fg-2 peer-disabled:text-fg-off'
        : 'text-xs font-medium text-text-300 peer-disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';
