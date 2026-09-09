import { describe, expect, it } from 'vitest';
import { BORDA_DO_REJEITADO, COR_DO_REJEITADO, bordaDoShort, corDoShort } from '../coresDosShorts';

// D-551: uma cor por short na regua, e sempre a MESMA cor.
//
// A cor e a unica ancora entre o bloco na regua e o card na coluna. Uma cor que
// mudasse a cada refetch seria pior que cinza para todos: o operador confia no
// primeiro mapa e se perde no segundo.

describe('corDoShort', () => {
  it('da cores diferentes a trechos vizinhos', () => {
    // Dois blocos colados com a mesma cor leem como um bloco so.
    expect(corDoShort(0)).not.toBe(corDoShort(1));
    expect(corDoShort(1)).not.toBe(corDoShort(2));
  });

  it('e estavel: o mesmo indice sempre devolve a mesma cor', () => {
    expect(corDoShort(3)).toBe(corDoShort(3));
  });

  it('da a volta em vez de ficar sem cor', () => {
    // Oito matizes cobrem o numero de trechos que um corte produz. Acima
    // disso repetir e melhor que devolver `undefined` e pintar nada.
    expect(corDoShort(8)).toBe(corDoShort(0));
    expect(corDoShort(9)).toBe(corDoShort(1));
  });

  it('indice negativo nao quebra', () => {
    // `findIndex` devolve -1 quando nao acha, e a regua nao pode cair por isso.
    expect(corDoShort(-1)).toBeTruthy();
  });

  it('a area e translucida, para a onda passar por baixo', () => {
    // Bloco opaco taparia a onda exatamente onde ela mais importa: dentro do
    // trecho que se esta ajustando.
    expect(corDoShort(0)).toMatch(/\/ 0\.\d+\)$/);
  });

  it('a borda usa o mesmo matiz da area', () => {
    const matiz = (cor: string) => cor.match(/hsl\((\d+)/)?.[1];

    expect(matiz(bordaDoShort(2))).toBe(matiz(corDoShort(2)));
  });

  it('a borda e mais opaca que a area', () => {
    // Ela marca ONDE o bloco acaba; diluida como a area, nao marcaria nada.
    const alfa = (cor: string) => Number(cor.match(/\/ ([\d.]+)\)/)?.[1]);

    expect(alfa(bordaDoShort(0))).toBeGreaterThan(alfa(corDoShort(0)));
  });
});

describe('rejeitado', () => {
  it('nao compete com quem ainda esta em jogo', () => {
    // Ele continua na regua porque OCUPA TEMPO — saber que aquele pedaco ja foi
    // olhado evita reavalia-lo. Mas com cor cheia viraria ruido.
    const alfa = (cor: string) => Number(cor.match(/\/ ([\d.]+)\)/)?.[1]);

    expect(alfa(COR_DO_REJEITADO)).toBeLessThan(alfa(corDoShort(0)));
  });

  it('e cinza, e nao um matiz da paleta', () => {
    expect(COR_DO_REJEITADO).toMatch(/hsl\(0 0%/);
    expect(BORDA_DO_REJEITADO).toMatch(/hsl\(0 0%/);
  });
});
