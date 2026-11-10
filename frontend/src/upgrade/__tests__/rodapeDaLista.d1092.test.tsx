import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContextColumn } from '../ContextColumn';
import { ItensDoPainel } from '../TopBar';
import type { ChromeLista } from '../UpgradeChrome';

// D-1092: a lista da casca ganhou um rodapé (os cortes riscados, na Bancada). Ele
// vem depois dos itens, na coluna da janela larga e no painel do seletor da
// janela estreita — os dois lugares onde a lista aparece.

const RODAPE = <section data-teste="rodape">Riscados · 1</section>;
const lista = (rodape?: ReactNode): ChromeLista => ({
  titulo: 'Cortes da live',
  itens: [{ id: 'c1', titulo: 'A renda da terra', dot: 'red' }],
  rodape,
});

describe('rodapé da lista na casca', () => {
  it('a coluna desenha o rodapé depois dos itens', () => {
    const html = renderToStaticMarkup(<ContextColumn lista={lista(RODAPE)} />);
    expect(html).toContain('data-teste="rodape"');
    expect(html.indexOf('A renda da terra')).toBeLessThan(html.indexOf('Riscados · 1'));
  });

  it('o painel do seletor desenha o rodapé depois dos itens', () => {
    const html = renderToStaticMarkup(<ItensDoPainel lista={lista(RODAPE)} fechar={vi.fn()} />);
    expect(html).toContain('data-teste="rodape"');
    expect(html.indexOf('A renda da terra')).toBeLessThan(html.indexOf('Riscados · 1'));
  });

  it('sem rodapé, nada sobra', () => {
    expect(renderToStaticMarkup(<ItensDoPainel lista={lista()} fechar={vi.fn()} />)).not.toContain('Riscados');
  });

  it('escolher um item no painel navega e fecha o painel', () => {
    const navegar = vi.fn();
    const fechar = vi.fn();
    const painel = ItensDoPainel({
      lista: { titulo: 'Cortes', itens: [{ id: 'c1', titulo: 'c1', dot: 'red', onClick: navegar }] },
      fechar,
    }) as ReactElement<{ children: ReactNode[] }>;
    const [linhas] = painel.props.children as [ReactElement<{ item: { onClick: () => void } }>[]];
    expect(isValidElement(linhas[0])).toBe(true);
    linhas[0].props.item.onClick();
    expect(navegar).toHaveBeenCalledOnce();
    expect(fechar).toHaveBeenCalledOnce();
  });
});
