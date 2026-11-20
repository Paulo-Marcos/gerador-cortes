import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { destinoDoVoltar, LinhaDoTopo, type LinhaDoTopoProps } from '../LinhaDoTopo';
import { SELETOR_MAX_PX } from '../medidas';

// D-1137 (E-069 H-13; DIRECAO §7.0): a linha do topo, no lugar da barra superior.
// O que a barra garantia e continua valendo veio para cá: o seletor tem teto
// (D-877), quem cede quando a linha aperta e em que ordem, a busca que nunca sai e
// os painéis que descem sem recorte (D-876). O SSR não mede; o degrau é simulado.

const medicao = vi.hoisted(() => ({ nivel: 0 }));
vi.mock('../apertoDaBarra', async (importOriginal) => {
  const real = await importOriginal<typeof import('../apertoDaBarra')>();
  return {
    ...real,
    useApertoDaBarra: () => ({ barra: { current: null }, trilha: { current: null }, espacador: { current: null }, nivel: medicao.nivel }),
  };
});

beforeEach(() => {
  medicao.nivel = 0;
});

const linha = (p: Partial<LinhaDoTopoProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LinhaDoTopo
        trilha={[{ texto: 'Biblioteca', to: '/projetos' }, { texto: 'LIVE 267', to: '/projetos/267' }, { texto: '#1' }]}
        titulo="Editor de cortes"
        etapas={<nav aria-label="Etapas da live" />}
        atual={{ titulo: 'A Ontologia do Ateísmo: Materialismo vs. Idealismo', num: '1', selo: <span title="Proposto pelo Claude">M</span> }}
        listaNoPainel={{ titulo: 'Cortes da live', itens: [] }}
        cabecalho={{
          sub: 'bruto 20:00 · líquido 17:37',
          acoes: [
            { icone: 'scissors', texto: 'Gerar bruto' },
            { icone: 'trash', texto: 'Excluir corte' },
          ],
        }}
        estado={{ texto: 'salvo', icone: 'circle-check', cor: 'var(--cc-ok)', bg: 'transparent' }}
        {...p}
      />
    </MemoryRouter>,
  );

const botaoComTexto = (html: string, texto: string) =>
  new RegExp(`<button[^>]*>(?:(?!</button>).)*${texto}(?:(?!</button>).)*</button>`, 's').test(html);

describe('linha do topo · o que ela tem', () => {
  it('"voltar" leva à migalha de cima que tem destino', () => {
    expect(destinoDoVoltar([{ texto: 'Biblioteca', to: '/projetos' }, { texto: 'LIVE 267', to: '/projetos/267' }, { texto: '#1' }])).toEqual({
      texto: 'LIVE 267',
      to: '/projetos/267',
    });
    expect(destinoDoVoltar([{ texto: 'Biblioteca' }])).toBeUndefined();
    const voltar = /<a [^>]*aria-label="Voltar para LIVE 267"[^>]*>/.exec(linha())?.[0] ?? '';
    expect(voltar).toContain('href="/projetos/267"');
  });

  it('o título da tela é o h1, a trilha da live entra e o seletor mostra o selo do corte aberto', () => {
    const html = linha();
    expect(html).toContain('<h1 class="sr-only">Editor de cortes</h1>');
    expect(html).toContain('aria-label="Etapas da live"');
    expect(html).toContain('Proposto pelo Claude');
  });

  it('o seletor diz o que J e K fazem', () => {
    const html = linha();
    expect(html).toMatch(/title="Item anterior · J"[^>]*aria-keyshortcuts="J"/);
    expect(html).toMatch(/title="Próximo item · K"[^>]*aria-keyshortcuts="K"/);
  });

  it('o seletor tem teto: o título longo do corte não empurra a linha', () => {
    expect(linha()).toMatch(new RegExp(`aria-haspopup="true" style="--teto:${SELETOR_MAX_PX}px" class="[^"]*max-w-\\[var\\(--teto\\)\\]`));
    expect(linha({ seletorCompacto: true })).toMatch(new RegExp(`<span title="#1 · A Ontologia[^"]*" style="--teto:${SELETOR_MAX_PX}px"`));
  });

  it('corta só de lado: o painel do seletor e o "Mais" descem inteiros', () => {
    const cabecalho = /<header class="([^"]*)"/.exec(linha())?.[1] ?? '';
    expect(cabecalho).toContain('overflow-x-clip');
    expect(cabecalho).toContain('overflow-y-visible');
    expect(cabecalho).toContain('z-30');
  });

  it('o sol/lua, o canal e o sino não estão mais aqui', () => {
    const html = linha();
    expect(html).not.toContain('Tema claro');
    expect(html).not.toContain('Canal ativo');
    expect(html).not.toContain('Abrir a fila');
  });
});

describe('linha do topo · quem cede quando ela aperta', () => {
  it('folgada, tudo à vista: subtítulo e as duas ações', () => {
    const html = linha();
    expect(html).toContain('bruto 20:00');
    expect(botaoComTexto(html, 'Gerar bruto')).toBe(true);
    expect(botaoComTexto(html, 'Excluir corte')).toBe(true);
  });

  it('degrau 1: o subtítulo sai primeiro', () => {
    medicao.nivel = 1;
    expect(linha()).not.toContain('bruto 20:00');
  });

  it('degrau 3: as ações da tela vão para um "⋯ Mais"', () => {
    medicao.nivel = 3;
    const html = linha();
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*>(?:(?!<\/button>).)*Mais<\/button>/s);
    expect(botaoComTexto(html, 'Gerar bruto')).toBe(false);
  });

  it.each([0, 1, 2, 3])('degrau %i: a busca e o estado nunca saem, e a busca não encolhe', (nivel) => {
    medicao.nivel = nivel;
    const html = linha();
    expect(html).toMatch(/aria-label="Buscar live, tela ou ação"[^>]*class="[^"]*flex-none/);
    expect(html).toContain('title="salvo"');
  });
});
