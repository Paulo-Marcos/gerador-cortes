import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Kpi } from '../kpi';

describe('Kpi', () => {
  it('com dado mostra o valor e a unidade', () => {
    const h = renderToStaticMarkup(<Kpi rotulo="Tempo" valor={6.4} unidade="min" />);
    expect(h).toContain('>6.4<');
    expect(h).toContain('>min<');
    expect(h).not.toContain('Sem dados');
  });

  it('sem dado mostra "Sem dados" com o motivo, nunca zero', () => {
    const h = renderToStaticMarkup(<Kpi rotulo="Retenção" motivo="O YouTube ainda não liberou." />);
    expect(h).toContain('Sem dados');
    expect(h).toContain('O YouTube ainda não liberou.');
    expect(h).toContain('data-semdados');
    expect(h).not.toMatch(/>0</);
  });

  it('null também é sem dado', () => {
    expect(renderToStaticMarkup(<Kpi rotulo="x" valor={null} />)).toContain('Sem dados');
  });

  it('zero medido é um zero de verdade, não ausência', () => {
    const h = renderToStaticMarkup(<Kpi rotulo="Publicados" valor={0} />);
    expect(h).toContain('>0<');
    expect(h).not.toContain('Sem dados');
  });

  it('sem motivo ainda diz por que está vazio', () => {
    expect(renderToStaticMarkup(<Kpi rotulo="x" />)).toContain('Ainda não há medição.');
  });
});
