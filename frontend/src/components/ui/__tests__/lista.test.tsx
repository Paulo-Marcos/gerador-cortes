import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CabecalhoDaLista, LinhaDaLista, Lista } from '../lista';

describe('Lista', () => {
  it('declara a grade em --cols (variável, não estilo de aparência)', () => {
    const h = renderToStaticMarkup(<Lista colunas="64px 1fr">x</Lista>);
    expect(h).toContain('--cols:64px 1fr');
    expect(h).toContain('<ul');
  });

  it('linha e cabeçalho usam a mesma grade', () => {
    const l = renderToStaticMarkup(<LinhaDaLista>a</LinhaDaLista>);
    const c = renderToStaticMarkup(<CabecalhoDaLista>a</CabecalhoDaLista>);
    expect(l).toContain('grid-cols-[var(--cols)]');
    expect(c).toContain('grid-cols-[var(--cols)]');
  });

  it('a linha tem 72 px de altura mínima e canto de bloco', () => {
    const h = renderToStaticMarkup(<LinhaDaLista>a</LinhaDaLista>);
    expect(h).toContain('min-h-linha');
    expect(h).toContain('rounded-bloco');
  });

  it('atual, marcada e riscada têm cada um a sua marca', () => {
    expect(renderToStaticMarkup(<LinhaDaLista atual>a</LinhaDaLista>)).toContain('aria-current="true"');
    expect(renderToStaticMarkup(<LinhaDaLista marcada>a</LinhaDaLista>)).toContain('bg-iris-suave');
    expect(renderToStaticMarkup(<LinhaDaLista riscada>a</LinhaDaLista>)).toContain('line-through');
  });

  it('nunca leva fio de luz nem feixe (§3.1)', () => {
    const h = renderToStaticMarkup(<LinhaDaLista atual marcada>a</LinhaDaLista>);
    expect(h).not.toMatch(/cc-fio\b|feixe/);
  });
});
