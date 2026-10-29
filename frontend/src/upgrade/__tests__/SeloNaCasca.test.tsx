import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LinhaDeLista } from '../ContextColumn';
import { TopBar } from '../TopBar';

// D-991: a casca só carrega a marca que a tela entrega (`selo`): a lista e o
// seletor do topo não sabem o que ela significa, e sem selo nada muda.
const MARCA = <span title="Proposto pelo Claude">M</span>;

const linha = (selo?: React.ReactNode) =>
  renderToStaticMarkup(
    <LinhaDeLista item={{ id: 'c1', titulo: 'Pedro II', dot: 'red', selo }} />,
  );

const topo = (selo?: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TopBar
        trilha={[{ texto: 'Biblioteca', to: '/projetos' }, { texto: '#7' }]}
        atual={{ titulo: 'Pedro II', num: '7', selo, onAnterior: vi.fn(), onProximo: vi.fn() }}
        listaNoPainel={{ titulo: 'Cortes da live', itens: [] }}
        tema="dark"
        onAlternarTema={vi.fn()}
      />
    </MemoryRouter>,
  );

describe('selo na casca (D-991)', () => {
  it('a linha da lista mostra o selo ao lado do título', () => {
    const html = linha(MARCA);
    expect(html).toContain('Proposto pelo Claude');
    expect(html.indexOf('Pedro II')).toBeLessThan(html.indexOf('Proposto pelo Claude'));
  });

  it('a linha sem selo fica como era', () => {
    expect(linha()).not.toContain('Proposto');
  });

  it('o seletor do topo mostra o selo do corte aberto', () => {
    expect(topo(MARCA)).toContain('Proposto pelo Claude');
    expect(topo()).not.toContain('Proposto');
  });
});
