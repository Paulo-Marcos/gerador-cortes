import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1127 (E-069 H-11c) · Aurora: a capa da live vira a luz da sala (DIRECAO §3.6).
//
// Uma camada só, parada, atrás de tudo. O custo é a regra do componente:
//   - a imagem é a MINIATURA de 64 px (`lib/miniaturaDaCapa`), desfocada uma vez e estática;
//   - o `filter` é fixo: nunca entra em `transition` nem em animação. Trocar de live troca o
//     `src` e anima só `opacity` (200 ms);
//   - `pointer-events-none` e `aria-hidden`: é decoração, nunca recebe clique nem é lida;
//   - a opacidade não é prop: vem do token `--cc-aurora-forca` (0,5 no escuro, 0,3 no claro),
//     que já troca com o tema; nenhuma tela inventa uma aurora mais forte.
// Sem `src` (live sem capa, Editor e Pós que tocam vídeo), ficam só os dois halos.

export interface AuroraProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Miniatura da capa (`blob:` ou URL). Ausente = só os halos. */
  src?: string | null;
}

// Halos: duas manchas fixas (íris e info) desfocadas uma vez. Sem animação de nenhum tipo.
const HALO = 'absolute rounded-full blur-[80px] opacity-40 [transform:translateZ(0)]';

export const Aurora = React.forwardRef<HTMLDivElement, AuroraProps>(function Aurora(
  { src, className, ...props },
  ref,
) {
  // A imagem entra com `opacity` só depois de carregar: trocar de capa não pisca.
  const [pronta, setPronta] = React.useState<string | null>(null);
  const visivel = Boolean(src) && pronta === src;
  return (
    <div
      ref={ref}
      aria-hidden
      data-aurora={src ? 'capa' : 'halos'}
      className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden [transform:translateZ(0)]', className)}
      {...props}
    >
      <span className={cn(HALO, '-left-[10%] -top-[20%] h-[55%] w-[45%] bg-iris')} />
      <span className={cn(HALO, '-right-[8%] top-[10%] h-[45%] w-[40%] bg-[var(--cc-info)]')} />
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          onLoad={() => setPronta(src)}
          className={cn(
            'absolute inset-x-[-10%] top-[-20%] h-[70%] w-[120%] max-w-none object-cover',
            'blur-[90px] saturate-[1.7] [transform:translateZ(0)]',
            'transition-opacity duration-200 motion-reduce:transition-none',
            visivel ? 'opacity-[var(--cc-aurora-forca)]' : 'opacity-0',
          )}
        />
      ) : null}
    </div>
  );
});
