import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Miniatura } from '../miniatura';

describe('Miniatura', () => {
  it('a capa nunca distorce: caixa com proporção fixa e imagem em object-cover', () => {
    const h = renderToStaticMarkup(<Miniatura src="/c.jpg" alt="Capa" />);
    expect(h).toContain('aspect-video');
    expect(h).toContain('data-proporcao="16/9"');
    expect(h).toMatch(/<img[^>]*class="[^"]*object-cover/);
    expect(h).toMatch(/<img[^>]*class="[^"]*size-full/);
    expect(h).not.toMatch(/object-fill|object-none/);
  });

  it('o short em pé guarda 9/16', () => {
    const h = renderToStaticMarkup(<Miniatura src="/c.jpg" proporcao="9/16" />);
    expect(h).toContain('aspect-[9/16]');
    expect(h).toContain('data-proporcao="9/16"');
  });

  it('a duração vem queimada no canto, em mono e formatada', () => {
    const h = renderToStaticMarkup(<Miniatura src="/c.jpg" duracaoSeg={3725} />);
    expect(h).toMatch(/data-duracao[^>]*class="[^"]*\bnum\b/);
    expect(h).toContain('>1:02:05<');
  });

  it('sem duração, nada é queimado', () => {
    expect(renderToStaticMarkup(<Miniatura src="/c.jpg" />)).not.toContain('data-duracao');
  });

  it('sem capa mostra o ícone no lugar e não emite <img>', () => {
    const h = renderToStaticMarkup(<Miniatura />);
    expect(h).toContain('data-sem-capa');
    expect(h).not.toContain('<img');
  });

  it('riscada apaga a capa; sem backdrop-filter', () => {
    const h = renderToStaticMarkup(<Miniatura src="/c.jpg" riscada duracaoSeg={5} />);
    expect(h).toContain('grayscale');
    expect(h).not.toMatch(/backdrop/);
  });
});
