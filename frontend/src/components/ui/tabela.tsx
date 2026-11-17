import * as React from 'react';
import clsx from 'clsx';

// D-1120 (E-069 H-10) · Tabela: `<table>` de verdade, para dado que se compara em colunas
// (análises, filas). Cabeçalho de 32 px em `micro`/`fg-3`, linha de 38 px, fio entre
// linhas, hover em `vidro`. Número vai à direita e em mono (`aDireita` + `numero`) para as casas
// alinharem. Sem caixa-alta: o peso e o tamanho fazem a hierarquia.

export const Tabela = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  function Tabela({ className, ...props }, ref) {
    return <table ref={ref} className={clsx('w-full border-collapse text-corpo text-fg', className)} {...props} />;
  },
);

export const TabelaCabeca = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;
export const TabelaCorpo = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;

export const TabelaLinha = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={clsx('group', className)} {...props} />
);

interface CelulaProps {
  /** Alinha à direita (não se chama `dir`: colide com o atributo HTML); use nas colunas de número. */
  aDireita?: boolean;
}

export const TabelaTitulo = ({
  aDireita = false,
  className,
  scope = 'col',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & CelulaProps) => (
  <th
    scope={scope}
    className={clsx('h-8 border-b border-fio px-3 text-micro text-fg-3', aDireita ? 'text-right' : 'text-left', className)}
    {...props}
  />
);

export const TabelaCelula = ({
  aDireita = false,
  numero = false,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & CelulaProps & { numero?: boolean }) => (
  <td
    className={clsx(
      'h-[38px] border-b border-fio px-3 group-hover:bg-vidro',
      aDireita && 'text-right',
      numero && 'num',
      className,
    )}
    {...props}
  />
);
