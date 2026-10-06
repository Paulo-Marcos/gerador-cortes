import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SELETOR_MAX_PX } from '../medidas';
import { TopBar } from '../TopBar';

// D-877: na Bancada a 1100 px a barra superior punha 1036 px de conteúdo em
// 888 — "Excluir corte" cortado, busca, fila e tema fora da tela. O SSR não
// mede; o degrau medido é simulado aqui e todo o resto é o código real.
const medicao = vi.hoisted(() => ({ nivel: 0 }));
vi.mock('../apertoDaBarra', async (importOriginal) => {
  const real = await importOriginal<typeof import('../apertoDaBarra')>();
  return {
    ...real,
    useApertoDaBarra: () => ({ barra: { current: null }, trilha: { current: null }, espacador: { current: null }, nivel: medicao.nivel }),
  };
});

const bancada = (seletorCompacto = false) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TopBar
        trilha={[{ texto: 'Biblioteca', to: '/projetos' }, { texto: '#1' }]}
        atual={{ titulo: 'A Ontologia do Ateísmo: Materialismo vs. Idealismo', num: '1' }}
        seletorCompacto={seletorCompacto}
        listaNoPainel={{ titulo: 'Cortes da live', itens: [] }}
        cabecalho={{
          sub: 'bruto 20:00 · líquido 17:37',
          acoes: [
            { icone: 'scissors', texto: 'Gerar bruto' },
            { icone: 'trash', texto: 'Excluir corte' },
          ],
        }}
        canal={{ nome: 'Sapo Analítico', handle: '@seucanal' }}
        estado={{ texto: 'salvo', icone: 'circle-check', cor: 'var(--ok)', bg: 'var(--ok-soft)' }}
        tema="dark"
        onAlternarTema={vi.fn()}
      />
    </MemoryRouter>,
  );

const botaoComTexto = (html: string, texto: string) =>
  new RegExp(`<button[^>]*>(?:(?!</button>).)*${texto}(?:(?!</button>).)*</button>`, 's').test(html);

beforeEach(() => {
  medicao.nivel = 0;
});

describe('TopBar · o seletor tem teto', () => {
  it('o botão do seletor não cresce com o título do corte', () => {
    // Era 442 px de 888: o botão media o título inteiro.
    expect(bancada()).toMatch(new RegExp(`aria-haspopup="true"[^>]*style="[^"]*max-width:${SELETOR_MAX_PX}px`));
  });

  it('o seletor compacto usa o mesmo teto', () => {
    expect(bancada(true)).toMatch(new RegExp(`<span title="#1 · A Ontologia[^"]*" style="[^"]*max-width:${SELETOR_MAX_PX}px`));
  });
});

describe('TopBar · quem cede quando a barra aperta', () => {
  it('folgada, tudo à vista: subtítulo, nome do canal e as duas ações', () => {
    const html = bancada();
    expect(html).toContain('bruto 20:00');
    expect(html).toContain('@seucanal');
    expect(botaoComTexto(html, 'Gerar bruto')).toBe(true);
    expect(botaoComTexto(html, 'Excluir corte')).toBe(true);
  });

  it('degrau 1: o subtítulo sai primeiro', () => {
    medicao.nivel = 1;
    const html = bancada();
    expect(html).not.toContain('bruto 20:00');
    expect(html).toContain('@seucanal');
  });

  it('degrau 2: o canal vira só o ícone, com o nome no rótulo acessível', () => {
    medicao.nivel = 2;
    const html = bancada();
    expect(html).not.toContain('>@seucanal<');
    expect(html).toContain('aria-label="Canal ativo: Sapo Analítico"');
    expect(botaoComTexto(html, 'Excluir corte')).toBe(true);
  });

  it('degrau 3: as ações da tela vão para um "⋯ Mais"', () => {
    medicao.nivel = 3;
    const html = bancada();
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*>(?:(?!<\/button>).)*Mais<\/button>/s);
    expect(botaoComTexto(html, 'Gerar bruto')).toBe(false);
    expect(botaoComTexto(html, 'Excluir corte')).toBe(false);
  });

  it.each([0, 1, 2, 3])('degrau %i: busca, estado, fila e tema nunca saem', (nivel) => {
    medicao.nivel = nivel;
    const html = bancada();
    expect(html).toContain('aria-label="Buscar live, tela ou ação"');
    expect(html).toContain('title="salvo"');
    expect(html).toContain('aria-label="Abrir a fila"');
    expect(html).toContain('aria-label="Tema claro"');
  });

  it('a busca em ícone não encolhe: era espremida a 16 px antes de alguém ceder', () => {
    expect(bancada()).toMatch(/aria-label="Buscar live, tela ou ação"[^>]*style="flex:none"/);
  });
});
