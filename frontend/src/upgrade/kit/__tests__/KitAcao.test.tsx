import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KitAcao } from '../KitAcao';

describe('KitAcao (D-1114)', () => {
  const html = renderToStaticMarkup(<KitAcao />);

  it('mostra todas as variantes do botão e os estados', () => {
    for (const v of ['primario', 'secundario', 'fantasma', 'destrutivo', 'destrutivo-cheio']) {
      expect(html).toContain(`data-variant="${v}"`);
    }
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it('mostra o botão de ícone, a ação de linha, as teclas e a ação de IA', () => {
    expect(html).toContain('data-variant="vidro"');
    expect(html).toContain('data-variant="link-de-acao"');
    expect(html).toContain('<kbd');
    expect(html).toContain('data-aparencia="sala-escura"');
  });

  it('o primário é o único no feixe nas variantes de repouso', () => {
    expect(html).toContain('bg-feixe');
  });
});
