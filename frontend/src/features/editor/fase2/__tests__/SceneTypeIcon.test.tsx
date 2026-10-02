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
    'tipo %s: desenha o ícone %s, a 14 px, sem emoji',
    (tipo, icone) => {
      const html = renderToStaticMarkup(<SceneTypeIcon tipo={tipo} />);
      expect(svg(html)).toMatch(/class="lucide lucide-/);
      expect(svg(html)).toContain('width="14"');
      // o ícone do tipo: o lucide grava o nome canônico na classe
      expect(html).toMatch(new RegExp(`lucide-${kebab(icone).split('-')[0]}`));
      expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    },
  );

  it('pinta o ícone com a cor do tipo', () => {
    const tipo = Object.keys(TIPOS_CENA)[0];
    expect(svg(renderToStaticMarkup(<SceneTypeIcon tipo={tipo} />))).toContain(
      `color:${metaCena(tipo).color}`,
    );
  });

  it('tipo desconhecido usa o ícone padrão do metaCena (filme), não um emoji', () => {
    const html = renderToStaticMarkup(<SceneTypeIcon tipo="tipo-que-nao-existe" />);
    expect(svg(html)).toContain('lucide-film');
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
