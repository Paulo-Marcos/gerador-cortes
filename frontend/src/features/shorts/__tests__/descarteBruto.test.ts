import { describe, expect, it } from 'vitest';
import { avisoDescarteBruto } from '../descarteBruto';

describe('avisoDescarteBruto', () => {
  const aviso = avisoDescarteBruto('O erro dos juros', 812.4);

  it('diz de qual corte e quanto disco esta em jogo', () => {
    expect(aviso).toContain('O erro dos juros');
    expect(aviso).toContain('812.4 MB');
  });

  it('avisa que o corte para de gerar shorts — nao so que apaga um arquivo', () => {
    expect(aviso).toContain('nao gera mais nenhum short');
  });

  it('avisa que refazer custa re-extrair a live', () => {
    expect(aviso).toContain('re-extrair o trecho da live');
  });
});
