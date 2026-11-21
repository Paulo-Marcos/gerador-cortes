// D-1181: a classe `bg-aviso/13` não gera CSS no Tailwind do projeto, porque
// 13 não está na escala de opacidade. Os avisos da Sala escura usam a forma
// arbitrária `bg-aviso/[.13]`. Este teste gera o CSS de verdade: se alguém
// voltar à forma sem colchetes, a faixa perde o fundo sem erro de build.
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../../../../tailwind.config';

async function gerar(classe: string): Promise<string> {
  const css = await postcss([
    tailwind({ ...config, content: [{ raw: `<div class="${classe}"></div>` }] }),
  ]).process('@tailwind utilities;', { from: undefined });
  return css.css;
}

describe('opacidade arbitrária em cores de token (D-1181)', () => {
  it('gera o fundo para bg-aviso/[.13]', async () => {
    const css = await gerar('bg-aviso/[.13]');
    expect(css).toContain('background-color');
    expect(css).toContain('var(--cc-aviso)');
  });

  it('não gera nada para bg-aviso/13, fora da escala', async () => {
    const css = await gerar('bg-aviso/13');
    expect(css).not.toContain('background-color');
  });
});
