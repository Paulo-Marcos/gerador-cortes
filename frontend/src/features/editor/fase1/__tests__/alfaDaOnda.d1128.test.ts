// D-1128: a onda do editor pinta o trecho que falta tocar e o já tocado com a MESMA cor
// (`--wb-text-dim`) a dois alfas, 85% e 42%: é a diferença entre eles que mostra até onde
// o vídeo andou. Com a ponte da Sala escura, `--wb-text-dim` chega como hex cru
// (`#9196a4`), e o `withAlpha` antigo só sabia pôr alfa num `oklch(…)`: as duas cores
// saíam iguais à entrada (achado da pr-audit do #399, medido no navegador).
import { describe, expect, it } from 'vitest';
import { withAlpha } from '../TimelinePanel';

describe('alfa das cores da onda', () => {
  it.each(['#9196a4', '#585d6b', 'oklch(0.52 0.015 250)', 'rgb(145 150 164)'])(
    'com %s, falta tocar e já tocado saem diferentes entre si e da entrada',
    (cor) => {
      const falta = withAlpha(cor, 0.85);
      const tocado = withAlpha(cor, 0.42);
      expect(falta).not.toBe(tocado);
      expect(falta).not.toBe(cor);
      expect(tocado).not.toBe(cor);
    },
  );

  it('o alfa vira a proporção da cor sobre o transparente, num formato que o canvas lê', () => {
    expect(withAlpha('#9196a4', 0.42)).toBe('color-mix(in oklab, #9196a4 42%, transparent)');
  });

  it('sem cor, devolve vazio (quem chama cai no padrão)', () => {
    expect(withAlpha('', 0.85)).toBe('');
  });
});
