import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// D-1120 (E-069 H-10): o cartão da Sala escura mora aqui ao lado do legado. `legado` é o
// padrão e mantém cada tela atual igual (é o mapa de variantes, como o Button da D-1114).
// `vidro` é o cartão de live em pé; `deitado` é o mesmo em linha. Raio 20 (`rounded-cartao`),
// fio de 1 px e brilho de 1 px no topo; sem `backdrop-filter` (DIRECAO §3.6): o cartão
// aparece em dezenas por tela e o desfoque é da casca. Sem feixe nem fio de luz (§3.1).
const cardVariants = cva('', {
  variants: {
    variante: {
      legado:
        'rounded-campo border border-fio bg-painel-solido shadow-topo',
      vidro:
        'flex flex-col gap-3 rounded-cartao border border-fio bg-vidro px-2.5 pb-3.5 pt-2.5 shadow-topo',
      deitado:
        'flex flex-row items-center gap-3.5 rounded-cartao border border-fio bg-vidro py-2.5 pl-2.5 pr-4 shadow-topo',
    },
    // Só o cartão que leva a algum lugar sobe um pouco ao pairar; o que é só painel não.
    interativo: {
      true: 'cursor-pointer transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-fio-2 hover:bg-vidro-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      false: '',
    },
  },
  defaultVariants: { variante: 'legado', interativo: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variante, interativo, ...props }, ref) => (
    <div
      ref={ref}
      data-sala={variante === 'vidro' || variante === 'deitado' ? '' : undefined}
      className={cn(cardVariants({ variante, interativo }), className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

/** O corpo de texto do cartão da Sala escura (o que fica ao lado ou abaixo da capa). */
export const CardCorpo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex min-w-0 flex-1 flex-col gap-1.5 px-1.5', className)} {...props} />
  ),
);
CardCorpo.displayName = 'CardCorpo';

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 p-4', className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4 pt-0', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-secao font-medium leading-tight text-fg', className)} {...props} />
);
