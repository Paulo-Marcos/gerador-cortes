import { describe, expect, it } from 'vitest';
import {
  aplicarCampo,
  arrastarSlot,
  CANVAS,
  LADO_MINIMO,
  ocupacaoDoPalco,
  paraCanvas,
  redimensionarPalco,
} from '../arrastarSlot';

// D-493: o arraste dos blocos do palco.
//
// Estes limites espelham `domain/palco_short.aplicar_ajustes`, que trava de novo
// tudo que chega — o backend e quem manda. A conta existe no frontend para o
// bloco responder na hora, nao para decidir sozinho.

const BLOCO = { x: 100, y: 200, w: 400, h: 600 };

describe('mover', () => {
  it('desliza o bloco inteiro', () => {
    expect(arrastarSlot(BLOCO, 'mover', 50, -30)).toEqual({ x: 150, y: 170, w: 400, h: 600 });
  });

  it('encosta na borda SEM encolher', () => {
    // Encolher ao bater na borda mudaria o tamanho por acidente — o tipo de
    // coisa que o operador desfaz sem entender o que fez.
    const encostado = arrastarSlot(BLOCO, 'mover', -9999, -9999);

    expect(encostado).toEqual({ x: 0, y: 0, w: 400, h: 600 });
  });

  it('nao sai pela direita nem por baixo', () => {
    const r = arrastarSlot(BLOCO, 'mover', 9999, 9999);

    expect(r.x + r.w).toBe(CANVAS.largura);
    expect(r.y + r.h).toBe(CANVAS.altura);
  });
});

describe('redimensionar', () => {
  it('o canto oposto fica parado ao puxar o sudeste', () => {
    const r = arrastarSlot(BLOCO, 'se', 100, 50);

    expect([r.x, r.y]).toEqual([BLOCO.x, BLOCO.y]);
    expect([r.w, r.h]).toEqual([500, 650]);
  });

  it('o canto oposto fica parado ao puxar o noroeste', () => {
    const r = arrastarSlot(BLOCO, 'nw', 50, 100);

    expect(r.x + r.w).toBe(BLOCO.x + BLOCO.w);
    expect(r.y + r.h).toBe(BLOCO.y + BLOCO.h);
  });

  it('nao encolhe abaixo do lado minimo', () => {
    for (const pega of ['ne', 'nw', 'se', 'sw'] as const) {
      const r = arrastarSlot(BLOCO, pega, -9999, -9999);

      expect(r.w).toBeGreaterThanOrEqual(LADO_MINIMO);
      expect(r.h).toBeGreaterThanOrEqual(LADO_MINIMO);
    }
  });

  it('nao cresce para fora do quadro', () => {
    const r = arrastarSlot(BLOCO, 'se', 9999, 9999);

    expect(r.x + r.w).toBeLessThanOrEqual(CANVAS.largura);
    expect(r.y + r.h).toBeLessThanOrEqual(CANVAS.altura);
  });

  it('devolve inteiros', () => {
    const r = arrastarSlot(BLOCO, 'se', 10.7, 20.3);

    expect(Object.values(r).every(Number.isInteger)).toBe(true);
  });
});

describe('aplicarCampo', () => {
  it('edita um lado e mantem o resto', () => {
    expect(aplicarCampo(BLOCO, 'w', '500')).toEqual({ ...BLOCO, w: 500 });
  });

  it('texto vazio devolve null em vez de zerar', () => {
    // `Number('')` e 0: um campo que zera sozinho joga o bloco para o canto.
    for (const lixo of ['', '   ', 'abc', '--']) {
      expect(aplicarCampo(BLOCO, 'x', lixo)).toBeNull();
    }
  });

  it('aceita virgula', () => {
    expect(aplicarCampo(BLOCO, 'x', '150,7')?.x).toBe(151);
  });

  it('valor absurdo e travado, nao recusado', () => {
    // Recusar faria o campo parecer quebrado; travar mostra o limite.
    expect(aplicarCampo(BLOCO, 'w', '99999')?.w).toBeLessThanOrEqual(CANVAS.largura);
    expect(aplicarCampo(BLOCO, 'x', '-100')?.x).toBe(0);
  });
});

describe('paraCanvas', () => {
  it('converte pixel de tela em pixel do quadro', () => {
    // Previa com 270px de largura representa 1080: cada pixel vale 4.
    expect(paraCanvas(10, 270)).toBe(40);
  });

  it('largura ainda desconhecida nao gera NaN', () => {
    expect(paraCanvas(10, 0)).toBe(0);
  });
});

describe('redimensionarPalco', () => {
  it('encolhe em torno do centro, e nao para o canto', () => {
    // O erro classico: mexer em w/h e esquecer x/y. O bloco encolhe grudado no
    // canto superior esquerdo e a moldura aparece so de dois lados.
    const saida = redimensionarPalco({ cheia: { x: 0, y: 0, w: 1080, h: 1920 } }, 0.9);

    expect(saida.cheia).toEqual({ x: 54, y: 96, w: 972, h: 1728 });
  });

  it('abre a moldura por igual dos quatro lados', () => {
    const saida = redimensionarPalco({ cheia: { x: 0, y: 0, w: 1080, h: 1920 } }, 0.8);
    const { x, y, w, h } = saida.cheia;

    expect(x).toBe(1080 - (x + w));
    expect(y).toBe(1920 - (y + h));
  });

  it('mantem a composicao de duas janelas empilhadas', () => {
    // Cada uma em torno do proprio centro: o que era de cima continua em cima.
    const saida = redimensionarPalco(
      {
        tela: { x: 0, y: 352, w: 1080, h: 608 },
        pessoa: { x: 0, y: 960, w: 1080, h: 960 },
      },
      0.9,
    );

    expect(saida.tela.y).toBeLessThan(saida.pessoa.y);
    expect(saida.tela.w).toBe(972);
    expect(saida.pessoa.w).toBe(972);
  });

  it('nao deixa o bloco sumir nem transbordar', () => {
    const minusculo = redimensionarPalco({ a: { x: 500, y: 900, w: 60, h: 60 } }, 0.1);
    expect(minusculo.a.w).toBe(LADO_MINIMO);

    const gigante = redimensionarPalco({ a: { x: 0, y: 0, w: 1080, h: 1920 } }, 3);
    expect(gigante.a).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
  });
});

describe('ocupacaoDoPalco', () => {
  it('e a fracao da largura do bloco mais largo', () => {
    expect(ocupacaoDoPalco({ a: { x: 0, y: 0, w: 1080, h: 1920 } })).toBe(1);
    expect(
      ocupacaoDoPalco({
        estreito: { x: 0, y: 0, w: 540, h: 400 },
        largo: { x: 0, y: 0, w: 972, h: 400 },
      }),
    ).toBeCloseTo(0.9);
  });

  it('sem bloco nenhum e zero, e nao NaN', () => {
    expect(ocupacaoDoPalco({})).toBe(0);
  });
});
