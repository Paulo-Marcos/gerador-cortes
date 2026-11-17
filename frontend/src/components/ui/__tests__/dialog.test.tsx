import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, caixaDoDialogo, devolverFoco, lembrarOrigem, type DialogProps } from '../dialog';

// D-1122 (E-069 H-11b): o diálogo e a gaveta. O ambiente de teste é `node`, sem DOM: aqui
// vai o que o servidor desenha e a lógica pura do foco. O comportamento vivo (foco preso,
// Esc, foco de volta) é do Radix e foi conferido no navegador, na página Kit.

const html = (props: Partial<DialogProps> = {}) =>
  renderToStaticMarkup(
    <Dialog open onClose={() => {}} title="Excluir a live?" {...props}>
      <p>corpo</p>
    </Dialog>,
  );

describe('Dialog (D-1122)', () => {
  it('fechado não desenha nada — nem o véu', () => {
    expect(html({ open: false })).toBe('');
  });

  it('aberto é um diálogo nomeado pelo título', () => {
    const h = html({ description: 'Isto não se desfaz.' });
    expect(h).toContain('role="dialog"');
    expect(h).toContain('data-state="open"');
    // O Radix liga `aria-labelledby`/`aria-describedby` ao montar no navegador (não no
    // servidor): lá foi conferido. Aqui, o título e a descrição existem como h2 e p.
    expect(h).toMatch(/<h2[^>]*>Excluir a live\?<\/h2>/);
    expect(h).toMatch(/<p[^>]*>Isto não se desfaz\.<\/p>/);
    expect(h).toContain('Excluir a live?');
    expect(h).toContain('Isto não se desfaz.');
    expect(h).toContain('corpo');
  });

  it('sem descrição não aponta para uma que não existe', () => {
    expect(html()).not.toContain('aria-describedby');
  });

  it('o fechar tem nome acessível e o pé vem de quem chama', () => {
    const h = html({ footer: <button>Excluir live</button> });
    expect(h).toContain('aria-label="Fechar"');
    expect(h).toContain('<footer');
    expect(h).toContain('Excluir live');
    expect(html()).not.toContain('<footer');
  });

  it('a gaveta tem 432 px e encosta à direita; o diálogo comum fica no centro', () => {
    const lateral = html({ tamanho: 'lateral' });
    expect(lateral).toContain('w-[432px]');
    expect(lateral).toContain('right-3');
    expect(lateral).not.toContain('-translate-x-1/2');
    const comum = html({ tamanho: 'md' });
    expect(comum).toContain('w-[560px]');
    expect(comum).toContain('-translate-x-1/2');
  });

  it.each([
    ['sm', 'w-[460px]'],
    ['md', 'w-[560px]'],
    ['lg', 'w-[880px]'],
    ['xl', 'w-[1152px]'],
    ['lateral', 'w-[432px]'],
  ] as const)('a largura %s é %s (DIRECAO §6)', (tamanho, classe) => {
    expect(caixaDoDialogo({ tamanho })).toContain(classe);
  });

  it('o véu usa o token e o fundo é sólido: nada de backdrop-filter (§3.6)', () => {
    const h = html();
    expect(h).toContain('bg-veu');
    expect(h).toContain('bg-pop');
    expect(h).not.toMatch(/backdrop/);
  });
});

describe('o foco volta a quem abriu (D-1122)', () => {
  it('lembra quem tinha o foco ao abrir e o devolve ao fechar', () => {
    const botao = { isConnected: true, focus: vi.fn() };
    const origem = lembrarOrigem(botao);
    devolverFoco(origem);
    expect(botao.focus).toHaveBeenCalledOnce();
  });

  it('se quem abriu saiu da página no meio do caminho, não devolve a ninguém', () => {
    const botao = { isConnected: false, focus: vi.fn() };
    devolverFoco(lembrarOrigem(botao));
    expect(botao.focus).not.toHaveBeenCalled();
  });

  it('sem foco ao abrir (o <body> não conta como alvo sem `focus`), não há a quem devolver', () => {
    expect(lembrarOrigem(null)).toBeNull();
    expect(lembrarOrigem({})).toBeNull();
    expect(() => devolverFoco(null)).not.toThrow();
  });
});
