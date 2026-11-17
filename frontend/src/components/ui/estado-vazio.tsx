import * as React from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';

// D-1120 (E-069 H-10) · Estados de tela, parte 1: vazio e carregando.
//
// Todo dado tem quatro estados e cada um precisa existir (DIRECAO §3.4): com dados,
// vazio, carregando e erro. Aqui moram os dois do meio; o erro é o `EstadoDeErro`.
//
// Vazio diz o que NÃO há e o que fazer (uma frase cada), com no máximo uma ação, e a
// ação é o `Button` (secundário por padrão: a tela decide quem é a primária, §5).
// Carregando é `role="status"` e diz o que busca ("Buscando as lives…"); os esqueletos
// ao redor são decoração.

export interface EstadoVazioProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  titulo: string;
  /** O que fazer a seguir, em uma frase. */
  descricao?: string;
  /** Nome do ícone do inventário; padrão "circle-dashed". */
  icone?: React.ComponentProps<typeof Icon>['name'];
  /** Rótulo da ação; sem `aoAgir` ela não aparece. */
  acao?: string;
  aoAgir?: () => void;
  /** Passe `true` quando esta for a ação primária da tela inteira. */
  acaoPrimaria?: boolean;
}

export const EstadoVazio = React.forwardRef<HTMLDivElement, EstadoVazioProps>(function EstadoVazio(
  { titulo, descricao, icone = 'circle-dashed', acao, aoAgir, acaoPrimaria = false, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-estado="vazio"
      className={clsx('flex flex-col items-center justify-center gap-2.5 p-10 text-center', className)}
      {...props}
    >
      <span
        aria-hidden
        className="inline-grid size-14 place-items-center rounded-[18px] border border-fio-2 bg-vidro-2 text-fg-2"
      >
        <Icon name={icone} className="size-6" />
      </span>
      <h3 className="text-linha text-fg">{titulo}</h3>
      {descricao && <p className="max-w-[44ch] text-corpo text-fg-3">{descricao}</p>}
      {acao && aoAgir && (
        <Button variant={acaoPrimaria ? 'primario' : 'secundario'} onClick={aoAgir} className="mt-2">
          {acao}
        </Button>
      )}
    </div>
  );
});

export interface EstadoCarregandoProps extends React.HTMLAttributes<HTMLDivElement> {
  /** O que está sendo buscado: "Buscando as lives…". */
  frase: string;
  /** Quantas linhas de esqueleto. */
  linhas?: number;
}

export const EstadoCarregando = React.forwardRef<HTMLDivElement, EstadoCarregandoProps>(
  function EstadoCarregando({ frase, linhas = 3, className, ...props }, ref) {
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        data-estado="carregando"
        className={clsx('flex flex-col gap-3', className)}
        {...props}
      >
        <p className="text-pequeno text-fg-3">{frase}</p>
        {Array.from({ length: linhas }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-bloco" />
        ))}
      </div>
    );
  },
);
