import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon as IconDoUi } from '../icon';
import { Icon as IconDaCasca } from '@/upgrade/Icon';
import { Kbd } from '../kbd';
import { LinkDeAcao } from '../link-de-acao';

describe('LinkDeAcao (D-1114)', () => {
  it('é texto em íris, não um botão de fundo', () => {
    const h = renderToStaticMarkup(<LinkDeAcao>Editar</LinkDeAcao>);
    expect(h).toContain('data-variant="link-de-acao"');
    expect(h).toContain('type="button"');
    expect(h).toContain('text-iris');
    expect(h).toContain('bg-transparent');
    expect(h).toContain('hover:underline');
    expect(h).toContain('focus-visible:outline-foco');
    expect(h).not.toContain('bg-feixe');
  });

  it('asChild vira o elemento filho', () => {
    const h = renderToStaticMarkup(
      <LinkDeAcao asChild>
        <a href="/corte/1">Editar</a>
      </LinkDeAcao>,
    );
    expect(h).toContain('<a ');
    expect(h).not.toContain('<button');
  });
});

describe('Kbd (D-1114)', () => {
  it('é uma <kbd> mono de vidro', () => {
    const h = renderToStaticMarkup(<Kbd>Ctrl</Kbd>);
    expect(h.startsWith('<kbd')).toBe(true);
    expect(h).toContain('font-mono');
    expect(h).toContain('bg-vidro');
    expect(h).toContain('>Ctrl<');
  });
});

describe('Icon em components/ui (D-1114)', () => {
  it('é o mesmo ícone da casca (uma porta só para o lucide)', () => {
    expect(IconDoUi).toBe(IconDaCasca);
    expect(renderToStaticMarkup(<IconDoUi name="sparkle" size={16} />)).toContain('<svg');
  });
});
