import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '../TopBar';

// D-876: a barra tinha `overflow: hidden`. Nas telas densas as ações da tela
// sobem para ela, e todo painel que desce dali — o do seletor de cortes, o
// "Mais" — ficava recortado nos 44 px: medido na Bancada a 1100 px, o painel
// existia no DOM em top 44,5 e nenhum pixel aparecia. O `hidden` tinha motivo:
// a linha fundida mede 1161 px numa barra de 888 e não pode rolar de lado.
const estiloDaBarra = (html: string) => /<header[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';

const barraDensa = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TopBar
        trilha={[{ texto: 'Biblioteca', to: '/projetos' }, { texto: '#7' }]}
        atual={{ titulo: 'Corte #7', num: '7', onAnterior: vi.fn(), onProximo: vi.fn() }}
        listaNoPainel={{ titulo: 'Cortes da live', itens: [] }}
        cabecalho={{ sub: '3 cortes', acoes: [{ icone: 'scissors', texto: 'Gerar bruto' }] }}
        tema="dark"
        onAlternarTema={vi.fn()}
      />
    </MemoryRouter>,
  );

describe('TopBar · o que transborda da barra', () => {
  it('deixa descer o painel do seletor e o das ações da tela', () => {
    const estilo = estiloDaBarra(barraDensa());
    expect(estilo).not.toMatch(/overflow:hidden/);
    expect(estilo).toMatch(/overflow:clip visible/);
  });

  it('continua cortando de lado: a linha fundida não rola na horizontal', () => {
    // `clip`, não `visible`: sem o corte, as ações vazariam pela direita.
    // E não `hidden` no X com `visible` no Y — esse par vira `auto` e rola.
    expect(estiloDaBarra(barraDensa())).toMatch(/overflow:clip /);
  });

  it('mantém a altura da barra e a camada acima do miolo', () => {
    const estilo = estiloDaBarra(barraDensa());
    expect(estilo).toMatch(/min-height:44px/);
    expect(estilo).toMatch(/position:relative/);
    expect(estilo).toMatch(/z-index:30/);
  });
});
