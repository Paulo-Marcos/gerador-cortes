import * as React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export const GEMINI_BRAND = '#4285F4';

export function GeminiIcon({ size = 14, className }: { size?: number; className?: string }) {
  // Sparkles works well as a generic AI/Gemini icon for now
  return <Sparkles size={size} className={className} />;
}

type GeminiAiButtonSize = 'sm' | 'md';

export interface GeminiAiButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  pending?: boolean;
  size?: GeminiAiButtonSize;
  label?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  iconSlot?: React.ReactNode;
}

const SIZE_CLASSES: Record<GeminiAiButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

const ICON_SIZE: Record<GeminiAiButtonSize, number> = {
  sm: 13,
  md: 15,
};

export const GeminiAiButton = React.forwardRef<HTMLButtonElement, GeminiAiButtonProps>(
  function GeminiAiButton(
    {
      className,
      pending = false,
      size = 'sm',
      label = 'Gemini',
      pendingLabel,
      iconSlot,
      disabled,
      style,
      ...props
    },
    ref,
  ) {
    const icon =
      iconSlot ??
      (pending ? (
        <Loader2 className="animate-spin" size={ICON_SIZE[size]} />
      ) : (
        <GeminiIcon size={ICON_SIZE[size]} />
      ));
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || pending}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] font-semibold text-white transition-colors',
          'shadow-[shadow:var(--wb-shadow-btn)] hover:brightness-110 active:brightness-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wb-focus,#4285F4)]',
          'disabled:pointer-events-none disabled:opacity-60',
          '[&_svg]:shrink-0',
          SIZE_CLASSES[size],
          className,
        )}
        style={{ backgroundColor: GEMINI_BRAND, ...style }}
        {...props}
      >
        {icon}
        <span>{pending && pendingLabel ? pendingLabel : label}</span>
      </button>
    );
  },
);
