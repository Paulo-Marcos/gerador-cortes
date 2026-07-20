import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 py-1 text-[13px] text-[var(--wb-text)] placeholder:text-[var(--wb-text-dim)]',
      'transition-colors focus-visible:outline-none focus-visible:border-[var(--wb-accent)] focus-visible:ring-1 focus-visible:ring-[var(--wb-accent)]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
