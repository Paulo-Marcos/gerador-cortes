import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

// D-1120 (E-069 H-10) · Estados de tela, parte 2: erro.
//
// Diz o que deu errado em palavras do operador (não o stack), ao lado do que ele pode
// fazer; a ação de tentar de novo é `Button` secundário. `role="alert"` para o leitor de
// tela anunciar. O tom é o do estado `erro` (texto + ícone de losango/alerta), nunca
// feixe nem íris (§4.2); fundo tintado a 7% e fio a 22%, como o botão destrutivo.
export interface EstadoDeErroProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  titulo: string;
  /** O motivo, em uma frase que o operador entende. */
  motivo?: string;
  /** Rótulo do botão ("Tentar de novo"); sem `aoTentar` ele não aparece. */
  acao?: string;
  aoTentar?: () => void;
}

export const EstadoDeErro = React.forwardRef<HTMLDivElement, EstadoDeErroProps>(function EstadoDeErro(
  { titulo, motivo, acao = 'Tentar de novo', aoTentar, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="alert"
      data-estado="erro"
      className={cn(
        'flex flex-col items-center justify-center gap-2.5 rounded-cartao border border-[color-mix(in_srgb,var(--cc-erro)_22%,transparent)] bg-[color-mix(in_srgb,var(--cc-erro)_7%,transparent)] p-10 text-center',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="inline-grid size-14 place-items-center rounded-[18px] border border-fio-2 bg-vidro-2 text-erro">
        <Icon name="triangle-alert" className="size-6" />
      </span>
      <h3 className="text-linha text-fg">{titulo}</h3>
      {motivo && <p className="max-w-[44ch] text-corpo text-fg-2">{motivo}</p>}
      {aoTentar && (
        <Button variant="secundario" onClick={aoTentar} className="mt-2">
          {acao}
        </Button>
      )}
    </div>
  );
});
