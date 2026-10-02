import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from '../Icon';

// D-861: o Icon é a única porta para o lucide (D-853). Estes casos fixam o
// contrato que a Onda 2 (D-854..D-857) passou a usar em todo o app: a escala
// curta, o traço único e o ícone decorativo por padrão.

const svg = (html: string) => html.match(/<svg[^>]*>/)?.[0] ?? '';

describe('Icon', () => {
  it('padrão: 14 px, traço 1,75 e decorativo (oculto do leitor de tela)', () => {
    const tag = svg(renderToStaticMarkup(<Icon name="scissors" />));
    expect(tag).toContain('width="14"');
    expect(tag).toContain('height="14"');
    expect(tag).toContain('stroke-width="1.75"');
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).not.toContain('role=');
  });

  it('desenha o glifo do nome pedido', () => {
    expect(svg(renderToStaticMarkup(<Icon name="scissors" />))).toContain('lucide-scissors');
    expect(svg(renderToStaticMarkup(<Icon name="triangle-alert" />))).toContain(
      'lucide-triangle-alert',
    );
  });

  it.each([16, 20] as const)('size %i vira a largura e a altura do svg', (size) => {
    const tag = svg(renderToStaticMarkup(<Icon name="check" size={size} />));
    expect(tag).toContain(`width="${size}"`);
    expect(tag).toContain(`height="${size}"`);
  });

  it('ilustracao é a figura grande, em px, e vence o size', () => {
    const tag = svg(renderToStaticMarkup(<Icon name="radio" size={16} ilustracao={34} />));
    expect(tag).toContain('width="34"');
    expect(tag).toContain('stroke-width="1.75"');
  });

  it('com rotulo, o ícone fala: role img e aria-label, sem aria-hidden', () => {
    const tag = svg(renderToStaticMarkup(<Icon name="hand" rotulo="Arrastar" />));
    expect(tag).toContain('role="img"');
    expect(tag).toContain('aria-label="Arrastar"');
    expect(tag).not.toContain('aria-hidden');
  });

  it('nunca encolhe numa linha flex e mantém o style e a classe de quem chama', () => {
    const tag = svg(
      renderToStaticMarkup(<Icon name="loader-2" className="animate-spin" style={{ marginTop: 2 }} />),
    );
    expect(tag).toContain('flex-shrink:0');
    expect(tag).toContain('margin-top:2px');
    expect(tag).toContain('animate-spin');
  });
});
