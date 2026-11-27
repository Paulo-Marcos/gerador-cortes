import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { visitar } from '../historicoDaCasca';
import { PaletaDeComandos } from '../PaletaDeComandos';

// D-1200 (DIRECAO §8.2): a paleta é um combobox ARIA 1.2 com lista. O foco fica no campo, e é o
// `aria-activedescendant` que diz ao leitor de tela qual opção as setas escolheram.

vi.mock('@/features/shorts/useFires', () => ({ useFires: () => ({ data: { fires: [] } }) }));
vi.mock('@/features/editor/useCortes', () => ({ useCortesProjeto: () => ({ data: [] }) }));
vi.mock('@/features/projetos/useProjetos', () => ({
  useProjetos: () => ({
    data: [
      { id: 7, titulo_live: 'Sermão da montanha', total_cortes: 3 },
      { id: 8, titulo_live: 'Sermão do areópago', total_cortes: 1 },
    ],
  }),
}));

type Elemento = React.ReactElement<Record<string, unknown>>;
type Passo = (arvore: React.ReactNode) => void;

function acha(no: React.ReactNode, quer: (el: Elemento) => boolean): Elemento | null {
  if (!React.isValidElement(no)) return null;
  const el = no as Elemento;
  if (quer(el)) return el;
  for (const filho of React.Children.toArray(el.props.children as React.ReactNode)) {
    const achado = acha(filho, quer);
    if (achado) return achado;
  }
  return null;
}

const digitar =
  (texto: string): Passo =>
  (arvore) => {
    const campo = acha(arvore, (e) => typeof e.props.aoMudar === 'function');
    (campo!.props.aoMudar as (t: string) => void)(texto);
  };

const apertar =
  (key: string): Passo =>
  (arvore) => {
    const caixa = acha(arvore, (e) => typeof e.props.onKeyDown === 'function');
    (caixa!.props.onKeyDown as (e: unknown) => void)({
      key,
      shiftKey: false,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
  };

/**
 * Sem DOM: chama a paleta dentro de uma sonda e aciona os handlers DELA, um por passada. O
 * renderizador de servidor refaz o componente quando o estado muda durante o render, então o
 * HTML final é o da paleta depois das teclas.
 */
function paletaDepoisDe(...passos: Passo[]): string {
  let proximo = 0;
  function Sonda() {
    const arvore = (PaletaDeComandos as (p: unknown) => React.ReactElement)({ aberta: true, onFechar: () => {} });
    if (proximo < passos.length) passos[proximo++](arvore);
    return arvore;
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Sonda />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tags = (html: string, trecho: string) =>
  [...html.matchAll(/<[a-z][^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(trecho));
const atributo = (tag: string, nome: string) => new RegExp(`\\s${nome}="([^"]*)"`).exec(tag)?.[1];

const campoDe = (html: string) => tags(html, '<input')[0];
const listaDe = (html: string) => tags(html, 'role="listbox"')[0];
const opcoesDe = (html: string) => tags(html, 'role="option"');

describe('D-1200 · a paleta é um combobox com lista', () => {
  it('depois da seta para baixo, o campo aponta para a opção que ficou ativa', () => {
    const html = paletaDepoisDe(digitar('sermao'), apertar('ArrowDown'));
    const opcoes = opcoesDe(html);
    expect(opcoes).toHaveLength(2);
    const ativas = opcoes.filter((o) => atributo(o, 'aria-selected') === 'true');
    expect(ativas).toHaveLength(1);
    expect(ativas[0]).toBe(opcoes[1]);
    expect(ativas[0]).toContain('data-ativo');
    expect(atributo(ativas[0], 'id')).toBeTruthy();
    expect(atributo(campoDe(html), 'aria-activedescendant')).toBe(atributo(ativas[0], 'id'));
    expect(atributo(opcoes[0], 'aria-selected')).toBe('false');
  });

  it('o campo é combobox aberto, de lista, e controla o listbox rotulado', () => {
    const html = paletaDepoisDe(digitar('sermao'));
    const campo = campoDe(html);
    expect(atributo(campo, 'role')).toBe('combobox');
    expect(atributo(campo, 'aria-expanded')).toBe('true');
    expect(atributo(campo, 'aria-autocomplete')).toBe('list');
    const lista = listaDe(html);
    expect(atributo(lista, 'aria-label')).toBe('Resultados');
    expect(atributo(campo, 'aria-controls')).toBe(atributo(lista, 'id'));
  });

  it('o id da opção é do item, não da posição: o mesmo item mantém o id quando a lista encolhe', () => {
    const idDe = (html: string, i: number) => atributo(opcoesDe(html)[i], 'id');
    const comDois = paletaDepoisDe(digitar('sermao'));
    const comUm = paletaDepoisDe(digitar('areopago'));
    expect(opcoesDe(comUm)).toHaveLength(1);
    expect(idDe(comUm, 0)).toBe(idDe(comDois, 1));
    expect(idDe(comDois, 0)).not.toBe(idDe(comDois, 1));
  });

  it('as opções saem da ordem do Tab: o foco fica no campo', () => {
    const opcoes = opcoesDe(paletaDepoisDe(digitar('sermao')));
    expect(opcoes).toHaveLength(2);
    for (const opcao of opcoes) {
      expect(atributo(opcao, 'tabindex')).toBe('-1');
    }
  });

  it('cada grupo com título é um group com o nome do título', () => {
    visitar({ to: '/projetos/7', rotulo: 'Sermão da montanha', icone: 'layout-grid', tipo: 'live' });
    const html = paletaDepoisDe();
    const grupo = tags(listaGrupos(html), 'role="group"')[0];
    const idDoTitulo = atributo(grupo, 'aria-labelledby');
    expect(idDoTitulo).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${idDoTitulo}"[^>]*>(?:<svg[\\s\\S]*?</svg>)?Onde eu estava<`));
    expect(opcoesDe(html)).toHaveLength(1);
  });

  it('o número de resultados é anunciado numa região viva discreta', () => {
    const anuncio = (html: string) => /<p [^>]*aria-live="polite"[^>]*>([^<]*)<\/p>/.exec(html);
    expect(anuncio(paletaDepoisDe(digitar('sermao')))?.[1]).toBe('2 resultados');
    expect(anuncio(paletaDepoisDe(digitar('areopago')))?.[1]).toBe('1 resultado');
    const nada = anuncio(paletaDepoisDe(digitar('zzzz')));
    expect(nada?.[1]).toBe('Nenhum resultado');
    expect(nada?.[0]).toContain('sr-only');
  });

  it('sem resultado a lista continua no lugar, vazia, e o campo não aponta para opção nenhuma', () => {
    const html = paletaDepoisDe(digitar('zzzz'), apertar('ArrowDown'));
    const campo = campoDe(html);
    expect(atributo(campo, 'aria-expanded')).toBe('false');
    expect(atributo(campo, 'aria-activedescendant')).toBeUndefined();
    expect(atributo(campo, 'aria-controls')).toBe(atributo(listaDe(html), 'id'));
    expect(html).toMatch(/role="listbox"[^>]*><\/div>/);
  });
});

/** Do começo da lista em diante: o chip de escopo também é um `group`, e não é este. */
function listaGrupos(html: string) {
  return html.slice(html.indexOf('role="listbox"'));
}
