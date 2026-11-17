import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from '../tabela';

describe('Tabela', () => {
  const h = renderToStaticMarkup(
    <Tabela>
      <TabelaCabeca>
        <TabelaLinha>
          <TabelaTitulo>Live</TabelaTitulo>
          <TabelaTitulo aDireita>Views</TabelaTitulo>
        </TabelaLinha>
      </TabelaCabeca>
      <TabelaCorpo>
        <TabelaLinha>
          <TabelaCelula>A</TabelaCelula>
          <TabelaCelula aDireita numero>
            10
          </TabelaCelula>
        </TabelaLinha>
      </TabelaCorpo>
    </Tabela>,
  );

  it('é uma tabela de verdade, com cabeçalho de coluna', () => {
    expect(h).toContain('<table');
    expect(h).toContain('<thead');
    expect(h).toContain('scope="col"');
  });

  it('número vai à direita e em mono', () => {
    expect(h).toMatch(/<td[^>]*class="[^"]*text-right[^"]*"[^>]*>10</);
    expect(h).toMatch(/<td[^>]*class="[^"]*\bnum\b/);
    expect(h).toContain('text-right');
  });

  it('cabeçalho de 32 px e linha de 38 px, sem caixa-alta', () => {
    expect(h).toContain('h-8');
    expect(h).toContain('h-[38px]');
    expect(h).not.toContain('uppercase');
  });
});
