import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KitListas } from '../KitListas';

describe('KitListas', () => {
  const h = renderToStaticMarkup(<KitListas />);

  it('mostra as peças da seção', () => {
    expect(h).toContain('aria-label="Listas e dados"');
    expect(h).toContain('aria-label="Cortes da live"');
    expect(h).toContain('<table');
  });

  it('mostra os estados vazio, carregando e erro e o KPI sem dados', () => {
    expect(h).toContain('data-estado="vazio"');
    expect(h).toContain('data-estado="carregando"');
    expect(h).toContain('data-estado="erro"');
    expect(h).toContain('Sem dados');
  });
});
