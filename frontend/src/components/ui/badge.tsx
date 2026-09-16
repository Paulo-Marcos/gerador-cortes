import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

// D-599: mesmo `.chip` do handoff, com o tom vindo da variante.
const CASCA_NOVA = isUpgradeShellEnabled();

const AP_TOM: Record<string, { cor: string; bg: string }> = {
  default: { cor: 'var(--mute)', bg: 'var(--inset)' },
  accent: { cor: 'var(--accent2)', bg: 'var(--accent-soft)' },
  success: { cor: 'var(--ok)', bg: 'var(--ok-soft)' },
  warning: { cor: 'var(--warn)', bg: 'var(--warn-soft)' },
  error: { cor: 'var(--err)', bg: 'var(--err-soft)' },
  info: { cor: 'var(--info)', bg: 'var(--info-soft)' },
};

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[var(--radius-xs)] border px-2 py-1 text-xs font-semibold leading-none',
  {
    variants: {
      variant: {
        default: 'border-[var(--wb-border-soft)] bg-[var(--wb-pill-bg)] text-[var(--wb-text-mute)]',
        accent:
          'border-[var(--wb-accent)]/30 bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong)]',
        success: 'border-success/30 bg-success/15 text-success',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        error: 'border-error/30 bg-error/15 text-error',
        info: 'border-info/30 bg-info/15 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, style, ...props }: BadgeProps) {
  if (CASCA_NOVA) {
    const tom = AP_TOM[variant ?? 'default'] ?? AP_TOM.default;
    return (
      <span
        className={cn('chip', className)}
        style={{ background: tom.bg, color: tom.cor, ...style }}
        {...props}
      />
    );
  }
  return <span className={cn(badgeVariants({ variant }), className)} style={style} {...props} />;
}
