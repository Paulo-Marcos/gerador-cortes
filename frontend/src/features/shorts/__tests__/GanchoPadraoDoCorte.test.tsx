import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GanchoPadraoDoCorte } from '../GanchoPadraoDoCorte';
import { ganchoPadraoKey } from '../useShortsDoCorte';

// D-901: o corte que não escolhe gancho segue o do canal, e a estrela diz qual é.

const DISPONIVEIS = [
  { id: 'g1', nome: 'Amarelo com caixa' },
  { id: 'g2', nome: 'Rosa' },
];

function renderizar(doCorte: string, doCanal: string) {
  const qc = new QueryClient();
  qc.setQueryData(ganchoPadraoKey('c1'), {
    gancho_padrao: doCorte,
    nome: '',
    payload: {},
    disponiveis: DISPONIVEIS,
    customizados: 0,
  });
  qc.setQueryData(['shorts', 'gancho-padrao-do-canal'], doCanal);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GanchoPadraoDoCorte corteId="c1" onEditar={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('gancho padrão do canal', () => {
  it('corte sem escolha própria segue o do canal, e a estrela marca', () => {
    const html = renderizar('', 'g1');
    expect(html).toContain('padrão do canal (Amarelo com caixa)');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('do canal');
  });

  it('corte com outro gancho oferece torná-lo o padrão do canal', () => {
    const html = renderizar('g2', 'g1');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Todo corte que não escolher o próprio gancho passa a usar este.');
  });

  it('canal sem padrão: a opção vazia continua sendo "cada trecho decide"', () => {
    const html = renderizar('', '');
    expect(html).toContain('cada trecho decide');
    expect(html).not.toContain('padrão do canal (');
  });
});
