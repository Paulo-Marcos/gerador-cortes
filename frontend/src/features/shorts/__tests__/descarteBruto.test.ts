import { describe, expect, it } from 'vitest';
import { avisoDescarteBruto, todosOsShortsForamRejeitados } from '../descarteBruto';

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

describe('todosOsShortsForamRejeitados', () => {
  it('só libera a rejeição do Fire quando todos os candidatos foram rejeitados', () => {
    expect(todosOsShortsForamRejeitados({ total: 3, rejeitado: 3 })).toBe(true);
    expect(todosOsShortsForamRejeitados({ total: 3, rejeitado: 2 })).toBe(false);
  });

  it('não trata Fire sem candidatos como rejeitado', () => {
    expect(todosOsShortsForamRejeitados({ total: 0, rejeitado: 0 })).toBe(false);
  });
});
