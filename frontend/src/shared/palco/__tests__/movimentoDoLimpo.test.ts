import { describe, expect, it } from 'vitest';
import { analisarNumeroDestaque, movimentoDoLimpo as m } from '@video-renderer/public-api';

// D-918: o movimento do estilo limpo, quadro a quadro (canvas "Movimento").

describe('movimento das cenas no estilo limpo (D-918)', () => {
  it('o traço cresce nos 6 primeiros quadros e fica cheio', () => {
    expect(m.progressoDoTraco(0)).toBe(0);
    expect(m.progressoDoTraco(3)).toBeGreaterThan(0.5);
    expect(m.progressoDoTraco(6)).toBe(1);
    expect(m.progressoDoTraco(14)).toBe(1);
    // No morph ele já começa cheio.
    expect(m.progressoDoTraco(0, true)).toBe(1);
  });

  it('as linhas entram depois do traço, uma a cada 4 quadros, subindo 10 px', () => {
    expect(m.estadoDaLinha(0, 0)).toEqual({ opacidade: 0, subida: 10 });
    expect(m.estadoDaLinha(6, 0)).toEqual({ opacidade: 0, subida: 10 });
    expect(m.estadoDaLinha(12, 0)).toEqual({ opacidade: 1, subida: 0 });
    // A segunda linha começa 4 quadros depois: no quadro 14 ainda está entrando.
    const segunda = m.estadoDaLinha(14, 1);
    expect(segunda.opacidade).toBeGreaterThan(0);
    expect(segunda.opacidade).toBeLessThan(1);
    expect(m.estadoDaLinha(16, 1).opacidade).toBe(1);
  });

  it('a saída leva os 6 últimos quadros, e o morph segura o traço', () => {
    expect(m.opacidadeDeSaida(100, 120)).toBe(1);
    expect(m.opacidadeDeSaida(117, 120)).toBeCloseTo(0.5);
    expect(m.opacidadeDeSaida(120, 120)).toBe(0);
    expect(m.opacidadeDeSaida(120, 120, true)).toBe(1);
  });

  it('o sublinhado da ênfase se desenha em 8 quadros depois do traço', () => {
    expect(m.progressoDoSublinhado(6)).toBe(0);
    expect(m.progressoDoSublinhado(14)).toBe(1);
  });

  it('o número conta do zero ao valor; "1 em 1 milhão" não conta', () => {
    expect(m.valorDaContagem(6, 45.7)).toBe(0);
    expect(m.valorDaContagem(26, 45.7)).toBeCloseTo(45.7);
    expect(analisarNumeroDestaque('1 em 1 milhão').valor).toBeNull();
    expect(analisarNumeroDestaque('45,7%').valor).toBeCloseTo(45.7);
  });

  it('a barra inferior nunca passa de 4 s; as outras cenas duram o que duram', () => {
    expect(m.duracaoEmQuadros('barra_inferior', 10, 22, 30)).toBe(120);
    expect(m.duracaoEmQuadros('barra_inferior', 10, 12, 30)).toBe(60);
    expect(m.duracaoEmQuadros('card_informacao', 10, 22, 30)).toBe(360);
  });

  it('o morph só acontece na mesma família e com menos de 0,25 s entre as cenas', () => {
    const card = { tipo: 'card_informacao', inicio: 0, fim: 5 };
    expect(m.continuaNaProxima(card, { tipo: 'definicao_termo', inicio: 5.1, fim: 9 })).toBe(true);
    expect(m.continuaNaProxima(card, { tipo: 'definicao_termo', inicio: 5.3, fim: 9 })).toBe(false);
    expect(m.continuaNaProxima(card, { tipo: 'lista_enumerada', inicio: 5.1, fim: 9 })).toBe(false);
    expect(m.continuaNaProxima(card, undefined)).toBe(false);
  });
});
