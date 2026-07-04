import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-3 py-1 text-sm text-text-100 placeholder:text-text-400',
      'transition-colors focus-visible:outline-none focus-visible:border-accent-500 focus-visible:ring-1 focus-visible:ring-accent-500',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
