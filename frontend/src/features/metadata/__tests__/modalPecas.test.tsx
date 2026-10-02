import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModalActionButton, SugestoesRecolhidas } from '../modalPecas';

// D-861: peças do modal de metadados que a Onda 2 tocou. O ModalActionButton
// recebia o componente do lucide num `icon: Icon` que escondia o Icon da
// escala; desde a D-856 recebe o nome do ícone.
const svg = (html: string) => html.match(/<svg[^>]*>/)?.[0] ?? '';

describe('ModalActionButton', () => {
  it('desenha o ícone do nome recebido a 14 px, ao lado do texto', () => {
    const html = renderToStaticMarkup(
      <ModalActionButton icon="wand-sparkles" onClick={vi.fn()}>
        Manual
      </ModalActionButton>,
    );
    expect(svg(html)).toContain('lucide-wand-sparkles');
    expect(svg(html)).toContain('width="14"');
    expect(svg(html)).toContain('aria-hidden="true"');
    expect(html).toContain('Manual</button>');
  });
});

describe('SugestoesRecolhidas', () => {
  const render = (aberto: boolean) =>
    renderToStaticMarkup(
      <SugestoesRecolhidas quantidade={2} aberto={aberto} onAlternar={vi.fn()}>
        <span>opção</span>
      </SugestoesRecolhidas>,
    );

  it('recolhida: a seta aponta para baixo e as sugestões não aparecem', () => {
    const html = render(false);
    expect(svg(html)).toContain('lucide-chevron-down');
    expect(svg(html)).not.toContain('rotate-180');
    expect(html).not.toContain('opção');
  });

  it('aberta: a seta vira e as sugestões aparecem', () => {
    const html = render(true);
    expect(svg(html)).toContain('rotate-180');
    expect(html).toContain('opção');
  });
});
