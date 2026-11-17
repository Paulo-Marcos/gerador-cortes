import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1120 (E-069 H-10) · Tabela: `<table>` de verdade, para dado que se compara em colunas
// (análises, filas). Cabeçalho de 32 px em `micro`/`fg-3`, linha de 38 px, fio entre
// linhas, hover em `vidro`. Número vai à direita e em mono (`aDireita` + `numero`) para as casas
// alinharem. Sem caixa-alta: o peso e o tamanho fazem a hierarquia.
//
// O tamanho de fonte vai FORA do `cn` (`${cn(...)} text-corpo`): o twMerge atual lê
// `text-corpo` como cor e o descartaria ao lado de `text-fg`.

export const Tabela = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  function Tabela({ className, ...props }, ref) {
    return <table ref={ref} className={`${cn('w-full border-collapse text-fg', className)} text-corpo`} {...props} />;
  },
);

export const TabelaCabeca = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TabelaCabeca(props, ref) {
    return <thead ref={ref} {...props} />;
  },
);

export const TabelaCorpo = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TabelaCorpo(props, ref) {
    return <tbody ref={ref} {...props} />;
  },
);

export const TabelaLinha = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  function TabelaLinha({ className, ...props }, ref) {
    return <tr ref={ref} className={cn('group', className)} {...props} />;
  },
);

interface CelulaProps {
  /** Alinha à direita (não se chama `dir`: colide com o atributo HTML); use nas colunas de número. */
  aDireita?: boolean;
}

export const TabelaTitulo = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & CelulaProps
>(function TabelaTitulo({ aDireita = false, className, scope = 'col', ...props }, ref) {
  return (
    <th
      ref={ref}
      scope={scope}
      className={`${cn('h-8 border-b border-fio px-3 text-fg-3', aDireita ? 'text-right' : 'text-left', className)} text-micro`}
      {...props}
    />
  );
});

export const TabelaCelula = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & CelulaProps & { numero?: boolean }
>(function TabelaCelula({ aDireita = false, numero = false, className, ...props }, ref) {
  return (
    <td
      ref={ref}
      className={cn(
        'h-[38px] border-b border-fio px-3 group-hover:bg-vidro',
        aDireita && 'text-right',
        numero && 'num',
        className,
      )}
      {...props}
    />
  );
});
