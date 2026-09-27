import * as React from 'react';
import { cn } from '@/lib/utils';

// D-599: na casca nova o campo e o `.fld` do handoff — 30 px, canto de 4 px,
// fundo `--inset`. A borda de foco continua em acento.

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'fld w-full placeholder:text-[var(--dim)] focus-visible:border-[var(--accent)] focus-visible:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
