import { cn } from '@/lib/utils';

export function ThumbnailPlaceholder({
  hue = 30,
  className,
  overlay,
}: {
  hue?: number;
  className?: string;
  overlay?: React.ReactNode;
}) {
  const gradientId = `thumb-gradient-${hue}`;
  const radialId = `thumb-radial-${hue}`;
  const patternId = `thumb-pattern-${hue}`;

  return (
    <div className={cn('relative aspect-video overflow-hidden bg-[var(--wb-bg-inset)]', className)}>
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`oklch(0.56 0.11 ${hue})`} />
            <stop offset="55%" stopColor={`oklch(0.36 0.08 ${hue + 20})`} />
            <stop offset="100%" stopColor={`oklch(0.2 0.05 ${hue - 20})`} />
          </linearGradient>
          <radialGradient id={radialId} cx="30%" cy="35%" r="70%">
            <stop offset="0%" stopColor="rgb(255 255 255 / 0.18)" />
            <stop offset="100%" stopColor="rgb(255 255 255 / 0)" />
          </radialGradient>
          <pattern id={patternId} x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
            <rect width="2" height="2" fill={`oklch(0.3 0.04 ${hue})`} opacity="0.08" />
            <rect width="1" height="2" fill="rgb(0 0 0 / 0.18)" />
          </pattern>
        </defs>
        <rect width="320" height="180" fill={`url(#${gradientId})`} />
        <rect width="320" height="180" fill={`url(#${radialId})`} />
        <rect width="320" height="180" fill={`url(#${patternId})`} opacity="0.35" />
        <circle cx="160" cy="112" r="38" fill="rgb(0 0 0 / 0.18)" />
        <ellipse cx="160" cy="180" rx="82" ry="42" fill="rgb(0 0 0 / 0.24)" />
      </svg>
      {overlay}
    </div>
  );
}
