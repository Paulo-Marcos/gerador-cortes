import * as React from 'react';
import { cn } from '@/lib/utils';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

// D-599: na casca nova o campo e o `.fld` do handoff — 30 px, canto de 4 px,
// fundo `--inset`. A borda de foco continua em acento.
const CASCA_NOVA = isUpgradeShellEnabled();

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      CASCA_NOVA
        ? 'fld w-full placeholder:text-[var(--dim)] focus-visible:border-[var(--accent)] focus-visible:outline-none'
        : cn(
            'flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 py-1 text-[13px] text-[var(--wb-text)] placeholder:text-[var(--wb-text-dim)]',
            'transition-colors focus-visible:outline-none focus-visible:border-[var(--wb-accent)] focus-visible:ring-1 focus-visible:ring-[var(--wb-accent)]',
          ),
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
