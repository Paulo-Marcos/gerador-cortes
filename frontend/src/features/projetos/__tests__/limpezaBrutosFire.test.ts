import { describe, expect, it } from 'vitest';
import { perguntaBrutosFire } from '../limpezaBrutosFire';

describe('perguntaBrutosFire', () => {
  it('nao pergunta quando a live nao tem bruto de Fire', () => {
    expect(perguntaBrutosFire({ brutos_fire: 0, retido_mb: 0 })).toBeNull();
  });

  it('nao pergunta quando a previa falhou — o default do backend ja preserva', () => {
    expect(perguntaBrutosFire(null)).toBeNull();
  });

  it('informa quantidade e disco para a decisao nao ser no escuro', () => {
    const pergunta = perguntaBrutosFire({ brutos_fire: 3, retido_mb: 1840.5 });

    expect(pergunta).toContain('3 brutos');
    expect(pergunta).toContain('1840.5 MB');
  });

  it('deixa explicito que cancelar mantem os brutos', () => {
    const pergunta = perguntaBrutosFire({ brutos_fire: 1, retido_mb: 700 });

    expect(pergunta).toContain('1 bruto de corte Fire');
    expect(pergunta).toContain('Cancelar = manter os brutos');
  });
});
