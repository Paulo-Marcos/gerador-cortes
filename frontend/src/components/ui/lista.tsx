import * as React from 'react';
import { cn } from '@/lib/utils';

// D-1120 (E-069 H-10) · Lista: linhas de 72 px sobre uma grade CSS que a própria lista
// declara em `--cols` (a mesma para o cabeçalho e para cada linha, para as colunas
// alinharem). A linha é transparente no repouso, `vidro` ao pairar. Nenhuma tem fio de
// luz (§3.1: "linha de lista, ninguém") nem feixe.
//
// Estados da linha, e cada um tem forma além da cor: `atual` (vidro-2 + brilho no topo),
// `marcada` (íris suave + fio de íris) e `riscada` (título riscado; quem desenha a capa
// apagada é a `Miniatura riscada`). A linha só organiza: botões e selo vão dentro,
// com o `Selo` dizendo de quem é a vez, um por linha (DIRECAO §5).

export interface ListaProps extends React.HTMLAttributes<HTMLUListElement> {
  /** Larguras das colunas, como no `grid-template-columns`: "64px 1fr 120px". */
  colunas: string;
}

type ColunasCss = React.CSSProperties & { '--cols': string };

export const Lista = React.forwardRef<HTMLUListElement, ListaProps>(function Lista(
  { colunas, className, style, ...props },
  ref,
) {
  // `--cols` é variável CSS: geometria de execução, não aparência (catraca estiloInline).
  const estilo: ColunasCss = { ...style, '--cols': colunas };
  return (
    <ul ref={ref} style={estilo} className={cn('m-0 flex list-none flex-col gap-1.5 p-0', className)} {...props} />
  );
});

const GRADE = 'grid grid-cols-[var(--cols)] items-center gap-x-4';

/** Cabeçalho das colunas: mesma grade da linha, 28 px, em `micro` e `fg-3`. */
export const CabecalhoDaLista = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  function CabecalhoDaLista({ className, ...props }, ref) {
    return (
      <li
        ref={ref}
        aria-hidden
        // O tamanho vai FORA do `cn`: o twMerge atual lê `text-micro` como cor e o descartaria
        // ao lado de `text-fg-3`. A cor pode ser trocada por `className`; o tamanho é fixo.
        className={`${cn(GRADE, 'h-7 pl-3 pr-3.5 text-fg-3', className)} text-micro`}
        {...props}
      />
    );
  },
);

export interface LinhaDaListaProps extends React.HTMLAttributes<HTMLLIElement> {
  atual?: boolean;
  marcada?: boolean;
  riscada?: boolean;
}

export const LinhaDaLista = React.forwardRef<HTMLLIElement, LinhaDaListaProps>(function LinhaDaLista(
  { atual = false, marcada = false, riscada = false, className, ...props },
  ref,
) {
  return (
    <li
      ref={ref}
      aria-current={atual ? 'true' : undefined}
      data-marcada={marcada || undefined}
      data-riscada={riscada || undefined}
      className={cn(
        GRADE,
        'min-h-linha rounded-bloco border border-transparent py-2 pl-3 pr-3.5 transition-[background-color,border-color] duration-150 motion-reduce:transition-none',
        'hover:border-fio hover:bg-vidro',
        atual && 'border-fio-2 bg-vidro-2 shadow-topo',
        marcada && 'border-iris-fio bg-iris-suave hover:border-iris-fio hover:bg-iris-suave',
        riscada && 'text-fg-3 line-through',
        className,
      )}
      {...props}
    />
  );
});
