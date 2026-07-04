import * as React from 'react';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'outline' | 'solid' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-7 w-7 rounded-[var(--radius-xs)] [&_svg]:size-3.5',
  md: 'h-9 w-9 rounded-[var(--radius-sm)] [&_svg]:size-4',
  lg: 'h-10 w-10 rounded-[var(--radius)] [&_svg]:size-5',
};

const variantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost:
    'border border-transparent bg-transparent text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
  outline:
    'border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
  solid: 'border border-transparent bg-[var(--wb-ink)] text-[var(--wb-ink-fg)] hover:opacity-90',
  accent:
    'border border-transparent bg-[var(--wb-accent)] text-white shadow-[var(--wb-shadow-btn)] hover:opacity-90',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        'disabled:pointer-events-none disabled:opacity-45',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);

IconButton.displayName = 'IconButton';
