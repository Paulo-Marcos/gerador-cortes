import { describe, expect, it } from 'vitest';
import { janelaVertical } from '../janelaEnquadramento';

// A conta aqui espelha `domain/formato_video.calcular_recorte` do backend. Se as
// duas divergirem, o operador aprova um enquadramento na tela e recebe outro no
// arquivo — o pior tipo de erro, porque nada quebra.

describe('janelaVertical', () => {
  it('num 16:9, a janela 9:16 ocupa pouco menos de um terco da largura', () => {
    const janela = janelaVertical(1920, 1080, 0.5);

    // 1080 * 9/16 = 607,5 de 1920 = 31,64%
    expect(janela.larguraPct).toBeCloseTo(31.64, 1);
  });

  it('foco no meio deixa sobra igual dos dois lados', () => {
    const janela = janelaVertical(1920, 1080, 0.5);
    const direita = 100 - janela.esquerdaPct - janela.larguraPct;

    expect(janela.esquerdaPct).toBeCloseTo(direita, 1);
  });

  it('foco na facecam da esquerda encosta a janela na borda', () => {
    // 0.101 e o foco derivado do crop_facecam padrao (D-464).
    expect(janelaVertical(1920, 1080, 0.101).esquerdaPct).toBe(0);
  });

  it('foco na direita encosta na outra borda, sem vazar', () => {
    const janela = janelaVertical(1920, 1080, 1);

    expect(janela.esquerdaPct + janela.larguraPct).toBeCloseTo(100, 1);
  });

  it('foco fora da faixa nao gera janela fora do quadro', () => {
    for (const foco of [-2, -0.1, 1.5, 9]) {
      const janela = janelaVertical(1920, 1080, foco);

      expect(janela.esquerdaPct).toBeGreaterThanOrEqual(0);
      expect(janela.esquerdaPct + janela.larguraPct).toBeLessThanOrEqual(100.01);
    }
  });

  it('video ja vertical nao tem o que recortar', () => {
    expect(janelaVertical(1080, 1920, 0.5).larguraPct).toBe(100);
  });

  it('dimensoes ausentes nao quebram a tela', () => {
    // Acontece de verdade: o primeiro render vem antes do loadedmetadata.
    expect(janelaVertical(0, 0, 0.5)).toEqual({ esquerdaPct: 0, larguraPct: 100 });
  });

  it('quadro 4:3 tambem e recortado, so que menos', () => {
    const dezesseisNove = janelaVertical(1920, 1080, 0.5).larguraPct;
    const quatroTres = janelaVertical(1440, 1080, 0.5).larguraPct;

    expect(quatroTres).toBeGreaterThan(dezesseisNove);
  });
});
