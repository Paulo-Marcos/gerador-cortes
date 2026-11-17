import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Kpi } from '../kpi';

describe('Kpi', () => {
  it('com dado mostra o valor e a unidade', () => {
    const h = renderToStaticMarkup(<Kpi rotulo="Tempo" valor={6.4} unidade="min" />);
    expect(h).toContain('>6,4<');
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
    expect(renderToStaticMarkup(<Kpi rotulo="x" valor={null} motivo="Sem leitura." />)).toContain('Sem dados');
  });

  it('zero medido é um zero de verdade, não ausência', () => {
    const h = renderToStaticMarkup(<Kpi rotulo="Publicados" valor={0} />);
    expect(h).toContain('>0<');
    expect(h).not.toContain('Sem dados');
  });

  it('sem valor o motivo é obrigatório (o tipo recusa) e é o que aparece', () => {
    // @ts-expect-error sem valor e sem motivo não compila
    const semMotivo = <Kpi rotulo="x" />;
    expect(semMotivo.props.rotulo).toBe('x');
    expect(renderToStaticMarkup(<Kpi rotulo="x" motivo="Ainda sem medição." />)).toContain('Ainda sem medição.');
  });

  it('o número sai em pt-BR, com vírgula decimal e ponto de milhar', () => {
    expect(renderToStaticMarkup(<Kpi rotulo="x" valor={48210} />)).toContain('>48.210<');
    expect(renderToStaticMarkup(<Kpi rotulo="x" valor="12 min" />)).toContain('>12 min<');
  });
});
