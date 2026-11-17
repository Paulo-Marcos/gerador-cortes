// A régua das catracas de design (D-1115): se `comparar` errasse, as onze
// catracas passariam sem ver nada. Aqui ela é provada com contagens à mão.

import { comparar } from './catraca';

describe('comparar contagem com linha de base', () => {
  const base = { 'src/a.tsx': 3, 'src/b.tsx': 1 };

  it('igual à base não reprova', () => {
    expect(comparar({ 'src/a.tsx': 3, 'src/b.tsx': 1 }, base)).toEqual({
      novos: {},
      cresceram: [],
      desatualizadas: [],
    });
  });

  it('arquivo fora da base é novo', () => {
    expect(comparar({ ...base, 'src/c.tsx': 1 }, base).novos).toEqual({ 'src/c.tsx': 1 });
  });

  it('arquivo da base que ganha ocorrência cresceu', () => {
    expect(comparar({ 'src/a.tsx': 4, 'src/b.tsx': 1 }, base).cresceram).toEqual(['src/a.tsx: 4 > teto 3']);
  });

  it('arquivo que melhorou ou zerou obriga a baixar a base', () => {
    const v = comparar({ 'src/a.tsx': 2 }, base);
    expect(v.desatualizadas).toHaveLength(2);
    expect(v.desatualizadas[0]).toContain('caiu para 2');
    expect(v.desatualizadas[1]).toContain('remova');
  });
});
