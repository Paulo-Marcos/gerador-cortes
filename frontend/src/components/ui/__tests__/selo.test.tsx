import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Selo, TONS_DO_SELO, type TomDoSelo } from '../selo';

const html = (tom: TomDoSelo) => renderToStaticMarkup(<Selo tom={tom}>Rótulo</Selo>);

// A forma de cada tom: o estado não pode depender só da cor (DIRECAO §3.4/§5).
const MARCA: Record<TomDoSelo, string> = {
  inerte: 'anel',
  neutro: 'ponto',
  curso: 'giro',
  convite: 'ponto-com-halo',
  ok: 'visto',
  erro: 'losango',
};

describe('Selo', () => {
  it('tem os seis tons do contrato, na ordem', () => {
    expect([...TONS_DO_SELO]).toEqual(['inerte', 'neutro', 'curso', 'convite', 'ok', 'erro']);
  });

  it.each(TONS_DO_SELO)('tom %s tem uma forma própria além da cor', (tom) => {
    expect(html(tom)).toContain(`data-marca="${MARCA[tom]}"`);
  });

  it('cada tom tem uma marca diferente das outras cinco', () => {
    expect(new Set(Object.values(MARCA)).size).toBe(6);
  });

  it.each(TONS_DO_SELO)('tom %s nunca usa a íris nem o feixe', (tom) => {
    expect(html(tom)).not.toMatch(/iris|feixe/);
  });

  it('é redondo e plano: pílula, sem sombra e sem backdrop-filter', () => {
    const h = html('ok');
    expect(h).toContain('rounded-pilula');
    expect(h).not.toMatch(/shadow-(?!\[)|backdrop/);
    expect(h).not.toContain('<button');
  });

  it.each(TONS_DO_SELO)('tom %s mantém o tamanho junto da cor (o cn não pode comer um dos dois)', (tom) => {
    const h = html(tom);
    expect(h).toContain('text-pequeno');
    expect(h).toMatch(/\[--c:var\(--cc-(fg-3|fg-2|info|aviso|ok|erro)\)\]/);
    expect(h).toContain('text-[color:var(--c)]');
  });

  it('diz o rótulo em palavras e esconde a marca do leitor de tela', () => {
    const h = html('erro');
    expect(h).toContain('Rótulo</span>');
    expect(h).toContain('aria-hidden="true"');
  });

  it('o giro respeita prefers-reduced-motion', () => {
    expect(html('curso')).toContain('motion-reduce:animate-none');
  });

  it('a dica vai para o title e className se mescla', () => {
    const h = renderToStaticMarkup(<Selo tom="ok" dica="Publicado" className="ml-2">No ar</Selo>);
    expect(h).toContain('title="Publicado"');
    expect(h).toContain('ml-2');
  });

  it('sem tom, vale neutro', () => {
    expect(renderToStaticMarkup(<Selo>Oi</Selo>)).toContain('data-tom="neutro"');
  });
});
