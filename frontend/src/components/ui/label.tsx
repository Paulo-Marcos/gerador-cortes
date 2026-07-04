import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-xs font-medium text-text-300 peer-disabled:opacity-50', className)}
    {...props}
  />
));
Label.displayName = 'Label';
