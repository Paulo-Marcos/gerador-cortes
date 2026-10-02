import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneTypeIcon } from '../SceneTypeIcon';
import { TIPOS_CENA, metaCena } from '../sceneTypes';

// D-858: o tipo de cena era um emoji colorido (🎥 📋 🔢 …) — cada sistema
// desenha o seu, fora da escala e do traço dos outros ícones. Agora é o
// ícone de traço do próprio tipo (o `icon` de TIPOS_CENA), na cor do tipo.
const svg = (html: string) => html.match(/<svg[^>]*>/)?.[0] ?? '';
const kebab = (nome: string) => nome.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

describe('SceneTypeIcon', () => {
  it.each(Object.entries(TIPOS_CENA).map(([tipo, meta]) => [tipo, meta.icon] as const))(
    'tipo %s: desenha o ícone %s, a 14 px, na cor do tipo, sem emoji',
    (tipo, icone) => {
      const html = renderToStaticMarkup(<SceneTypeIcon tipo={tipo} />);
      expect(svg(html)).toMatch(/class="lucide lucide-/);
      expect(svg(html)).toContain('width="14"');
      // o ícone do tipo, pelo nome inteiro (a aspa impede `list` casar com
      // `list-checks`), e na cor do tipo
      expect(svg(html)).toContain(`lucide-${kebab(icone)}"`);
      expect(svg(html)).toContain(`color:${metaCena(tipo).color}`);
      expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    },
  );

  it('tipo desconhecido usa o ícone padrão do metaCena (filme), não um emoji', () => {
    const html = renderToStaticMarkup(<SceneTypeIcon tipo="tipo-que-nao-existe" />);
    expect(svg(html)).toContain('lucide-film');
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
