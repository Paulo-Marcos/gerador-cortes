import { createContext, useContext, type ReactNode } from 'react';

// D-1197: o contrato do Dialog do Radix que importa ao descarte, sem o DOM que o
// Radix de verdade pede. No Radix, Esc, o clique fora e o X chegam TODOS por
// `onOpenChange(false)`; o dublê reproduz exatamente isso. O foco preso, as camadas
// e a animação são do Radix e se conferem no navegador.

const Fechar = createContext<() => void>(() => {});

type Filhos = { children?: ReactNode };

export function Root({ open, onOpenChange, children }: Filhos & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return open ? <Fechar.Provider value={() => onOpenChange(false)}>{children}</Fechar.Provider> : null;
}

export function Overlay() {
  const fechar = useContext(Fechar);
  return <div data-veu="" onPointerDown={fechar} />;
}

export function Content({ children }: Filhos) {
  const fechar = useContext(Fechar);
  return (
    <div role="dialog" onKeyDown={(e) => e.key === 'Escape' && fechar()}>
      {children}
    </div>
  );
}

export function Close({ children, ...resto }: Filhos & { 'aria-label'?: string }) {
  const fechar = useContext(Fechar);
  return (
    <button type="button" aria-label={resto['aria-label']} onClick={fechar}>
      {children}
    </button>
  );
}

export const Title = ({ children }: Filhos) => <h2>{children}</h2>;
export const Description = ({ children }: Filhos) => <p>{children}</p>;
