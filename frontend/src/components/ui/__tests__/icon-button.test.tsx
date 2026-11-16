import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconButton } from '../icon-button';

describe('IconButton (D-1114)', () => {
  it('variantes novas: círculo de luz com data-variant e nome para o leitor de tela', () => {
    const h = renderToStaticMarkup(<IconButton variant="vidro" aria-label="Fechar" />);
    expect(h).toContain('data-variant="vidro"');
    expect(h).toContain('aria-label="Fechar"');
    expect(h).toContain('aspect-square');
    expect(h).toContain('rounded-pilula');
    expect(h).toContain('type="button"');
    expect(h).not.toContain('backdrop');
  });

  it('destrutivo e fantasma usam as cores do papel', () => {
    expect(renderToStaticMarkup(<IconButton variant="destrutivo" aria-label="Apagar" />)).toContain('text-erro');
    expect(renderToStaticMarkup(<IconButton variant="fantasma" aria-label="Mais" size="pq" />)).toContain('h-botao-pq');
  });

  it('variante nova sem aria-label não compila', () => {
    // @ts-expect-error — o nome acessível é obrigatório nas variantes novas
    renderToStaticMarkup(<IconButton variant="vidro" />);
  });

  it('o contrato antigo segue igual: sem aria-label e com o estilo inline do toggle', () => {
    const h = renderToStaticMarkup(<IconButton />);
    expect(h).toContain('class="btn btn-icon btn-ghost"');
    expect(h).not.toContain('data-variant');
    const t = renderToStaticMarkup(<IconButton variant="toggle-active" size="sm" />);
    expect(t).toContain('btn btn-icon btn-sm');
    expect(t).toContain('border-color:var(--accent)');
  });
});
