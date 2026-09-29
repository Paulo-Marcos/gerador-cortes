import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImagemAmpliada, ImagemAmpliavel } from '../imagem-ampliavel';

// D-821: conferir uma capa pequena exige vê-la grande.

describe('ImagemAmpliavel', () => {
  it('a miniatura é um botão que diz que amplia', () => {
    const html = renderToStaticMarkup(<ImagemAmpliavel src="/capa.png" alt="Capa do TikTok" />);
    expect(html).toContain('aria-label="Ampliar: Capa do TikTok"');
    expect(html).toContain('cursor-zoom-in');
    expect(html).toContain('src="/capa.png"');
  });

  it('fechada, não desenha a camada grande', () => {
    const html = renderToStaticMarkup(<ImagemAmpliavel src="/capa.png" alt="Capa" />);
    expect(html).not.toContain('role="dialog"');
  });
});

describe('ImagemAmpliada', () => {
  it('mostra a imagem inteira, sem recorte, com como fechar', () => {
    const html = renderToStaticMarkup(
      <ImagemAmpliada src="/capa.png" alt="Capa" onFechar={() => undefined} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('object-contain');
    expect(html).toContain('aria-label="Fechar"');
  });
});
