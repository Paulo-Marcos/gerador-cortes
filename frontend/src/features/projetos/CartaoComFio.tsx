import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// D-1148 (E-069 H-15; DIRECAO §3.1) · O cartão com o fio de luz: UM por tela. Na
// Biblioteca é o "Continue de onde parou"; no canal novo, o "Cole o link". Os dois
// passam por aqui para o fio (`.cc-fio`, borda em degradê por máscara) ter um só
// dono na pasta. Vidro chapado, sem `backdrop-filter` (§3.6): o desfoque é da casca.
export function CartaoComFio({
  rotulo,
  className,
  children,
}: {
  /** O nome da região para o leitor de tela ("Continue de onde parou"). */
  rotulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={rotulo}
      data-sala=""
      data-fio-de-luz=""
      className={cn('cc-fio rounded-painel border bg-vidro p-5 shadow-topo', className)}
    >
      {children}
    </section>
  );
}
