import { describe, expect, it } from 'vitest';
import {
  avisoDescarteBruto,
  rotuloDescarteBruto,
  todosOsShortsForamRejeitados,
} from '../descarteBruto';

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
  it('só considera o Fire resolvido quando todos os candidatos foram rejeitados', () => {
    expect(todosOsShortsForamRejeitados({ total: 3, rejeitado: 3 })).toBe(true);
    expect(todosOsShortsForamRejeitados({ total: 3, rejeitado: 2 })).toBe(false);
  });

  it('não trata Fire sem candidatos como rejeitado', () => {
    expect(todosOsShortsForamRejeitados({ total: 0, rejeitado: 0 })).toBe(false);
  });
});

describe('rotuloDescarteBruto', () => {
  it('diz o que a ação faz: descartar o bruto, nunca rejeitar o Fire', () => {
    const rotulo = rotuloDescarteBruto({ total: 3, rejeitado: 3 }, 812.4);
    expect(rotulo).toBe('Descartar o bruto (812.4 MB): nenhum candidato restou');
    expect(rotulo).not.toMatch(/rejeitar/i);
  });

  it('com candidatos vivos, mostra só a ação e o disco', () => {
    expect(rotuloDescarteBruto({ total: 3, rejeitado: 1 }, 812.4)).toBe(
      'Descartar o bruto (812.4 MB)',
    );
  });
});
