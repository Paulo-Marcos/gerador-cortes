import * as React from 'react';
import clsx from 'clsx';

// D-1120 (E-069 H-10) · Skeleton: o espaço de algo que ainda carrega. O brilho que
// corre é só `transform`/posição de fundo e some com "reduzir movimento"; fica como um
// bloco parado de `vidro-2`. Decorativo: quem agrupa os esqueletos anuncia o
// "Carregando…" (ver `EstadoCarregando` em `estado-vazio.tsx`), por isso `aria-hidden`.
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Skeleton({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        data-skeleton
        className={clsx(
          'rounded-lg bg-vidro-2 motion-safe:animate-pulse',
          className,
        )}
        {...props}
      />
    );
  },
);
