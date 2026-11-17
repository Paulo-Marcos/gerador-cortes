import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1116 (E-069 H-08): o Field é o conjunto "rótulo + controle + ajuda/erro" da Sala
// escura. Ele não desenha o controle: gera os ids e os passa por contexto, para que
// `Input`, `Textarea`, `Select` e `Busca` liguem sozinhos o rótulo (`htmlFor`), a
// mensagem (`aria-describedby`) e o estado inválido (`aria-invalid`) sem a tela repetir.

type LigacaoDoCampo = {
  id: string;
  describedBy: string | undefined;
  invalido: boolean;
  obrigatorio: boolean;
};

const CampoContext = React.createContext<LigacaoDoCampo | null>(null);

/** Ligação do controle ao `Field` em volta; `null` quando o controle está solto. */
export function useLigacaoDoCampo(): LigacaoDoCampo | null {
  return React.useContext(CampoContext);
}

/** Classes do corpo de um campo (§3.4): poço, fio de campo, hover, foco em íris e erro. */
export const CLASSES_DO_CAMPO = cn(
  'w-full rounded-campo border border-campo bg-poco text-[13px] text-fg',
  'transition-[border-color,box-shadow,background-color] duration-150',
  'placeholder:text-fg-3',
  'hover:border-fg/[.62]',
  'focus-visible:border-iris focus-visible:bg-iris/5 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--cc-iris-suave)]',
  'aria-[invalid=true]:border-erro aria-[invalid=true]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--cc-erro)_16%,transparent)]',
  'disabled:cursor-not-allowed disabled:border-dashed disabled:border-fio disabled:bg-transparent disabled:text-fg-off disabled:shadow-none disabled:hover:border-fio',
  'aria-busy:cursor-progress',
);

export type FieldProps = {
  rotulo: string;
  /** Texto de apoio, sempre visível. Some quando há `erro`. */
  ajuda?: string;
  /** Mensagem de erro: marca o controle como inválido e é lida pelo leitor de tela. */
  erro?: string;
  obrigatorio?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({ rotulo, ajuda, erro, obrigatorio = false, className, children }: FieldProps) {
  const id = React.useId();
  const mensagemId = `${id}-msg`;
  const temMensagem = Boolean(erro) || Boolean(ajuda);
  const ligacao: LigacaoDoCampo = {
    id,
    describedBy: temMensagem ? mensagemId : undefined,
    invalido: Boolean(erro),
    obrigatorio,
  };
  return (
    <CampoContext.Provider value={ligacao}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-xs font-semibold leading-4 text-fg-2">
          {rotulo}
          {obrigatorio && (
            <span aria-hidden="true" className="ml-0.5 text-erro">
              *
            </span>
          )}
        </label>
        {children}
        {temMensagem && (
          <p
            id={mensagemId}
            // Erro anuncia na hora; ajuda é só leitura, não interrompe.
            role={erro ? 'alert' : undefined}
            className={cn('text-xs leading-4', erro ? 'text-erro' : 'text-fg-3')}
          >
            {erro ?? ajuda}
          </p>
        )}
      </div>
    </CampoContext.Provider>
  );
}
