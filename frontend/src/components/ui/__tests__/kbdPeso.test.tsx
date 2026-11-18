// D-1123: `text-micro` traz peso 600 na escala; a tecla (Kbd) segura o 500 da DIRECAO.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Kbd } from '../kbd';

describe('Kbd na escala de fonte', () => {
  it('declara font-medium para o text-micro não engrossá-la', () => {
    const h = renderToStaticMarkup(<Kbd>K</Kbd>);
    expect(h).toContain('text-micro');
    expect(h).toContain('font-medium');
  });
});
