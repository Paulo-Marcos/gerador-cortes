import * as React from 'react';
import { cn } from '@/lib/utils';

// D-599: na casca nova o botão de ícone é o `.btn.btn-icon` do handoff —
// 30 px quadrados, canto de 4 px. As variantes de COR continuam valendo:
// elas carregam significado (ok = aprovar, err = rejeitar, fire, leitura),
// e trocar significado por estética seria perder informação.

const AP_SIZES: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'btn btn-icon btn-sm',
  md: 'btn btn-icon',
  lg: 'btn btn-icon',
  toolbar: 'btn btn-icon',
  'toolbar-sm': 'btn btn-icon btn-sm',
};

const AP_VARIANTS: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'btn-ghost',
  outline: '',
  solid: 'btn-pri',
  accent: 'btn-pri',
  ok: 'btn-ok',
  err: 'btn-danger',
  'err-outline': 'btn-danger',
  'fire-soft': 'btn-soft',
  'leitura-soft': 'btn-soft',
  inset: 'btn-soft',
  'toggle-active': '',
};

const AP_INLINE: Partial<Record<NonNullable<IconButtonProps['variant']>, React.CSSProperties>> = {
  'fire-soft': { background: 'var(--accent-soft)', color: 'var(--accent)' },
  'leitura-soft': { background: 'var(--info-soft)', color: 'var(--info)' },
  'toggle-active': {
    borderColor: 'var(--accent)',
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
  },
};

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'ghost'
    | 'outline'
    | 'solid'
    | 'accent'
    | 'ok'
    | 'err'
    | 'err-outline'
    | 'fire-soft'
    | 'leitura-soft'
    | 'inset'
    | 'toggle-active';
  size?: 'sm' | 'md' | 'lg' | 'toolbar' | 'toolbar-sm';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'md', type = 'button', style, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(AP_SIZES[size], AP_VARIANTS[variant], className)}
      style={{ ...AP_INLINE[variant], ...style }}
      {...props}
    />
  ),
);

IconButton.displayName = 'IconButton';
