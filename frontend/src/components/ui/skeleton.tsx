import * as React from 'react';
import { cn } from '@/lib/utils';
// D-1120 (E-069 H-10) · Skeleton: o espaço de algo que ainda carrega. Pulsa só a opacidade
// (`animate-pulse`) e para com "reduzir movimento", ficando um bloco parado de `vidro-2`.
// Decorativo: quem agrupa os esqueletos anuncia o
// "Carregando…" (ver `EstadoCarregando` em `estado-vazio.tsx`), por isso `aria-hidden`.
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Skeleton({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        data-skeleton
        className={cn(
          'rounded-lg bg-vidro-2 motion-safe:animate-pulse',
          className,
        )}
        {...props}
      />
    );
  },
);
