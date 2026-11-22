import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpgradeShell } from '../UpgradeShell';

// D-1137 (E-069 H-13; DIRECAO §7.0, §3.6 e §8.2): a sala montada de verdade, em HTML.

// A chave da lista de canais (`useCanais`).
const CANAIS_KEY = ['canais'];
const CANAL = { id: 'sapo', nome: 'Sapo Analítico', handle: '@sapo', ativo: true, credito: '', youtube_channel_id: '', paleta: { primaria: '', secundaria: '', acento: '' } };

function casca(rota: string) {
  const qc = new QueryClient();
  qc.setQueryData(CANAIS_KEY, { canais: [CANAL] });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <UpgradeShell>
          <p>conteudo-da-tela</p>
        </UpgradeShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const colunas = (html: string) => /--colunas:([^;"]+)/.exec(html)?.[1];
const atributo = (html: string, nome: string) => new RegExp(`<div class="ap [^"]*"[^>]*${nome}="([^"]*)"`).exec(html)?.[1];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('a sala · fora de uma live', () => {
  const html = casca('/projetos');

  it('o trilho fica aberto, com 244 px', () => {
    expect(colunas(html)).toBe('244px 1fr');
    expect(html).toContain('aria-label="Trilho"');
  });

  it('não há barra no topo: a tela tem o próprio cabeçalho, com h1 e a busca em pílula', () => {
    expect(html).not.toContain('<header');
    expect(html).toMatch(/<h1[^>]*>Biblioteca de <span[^>]*>lives<\/span><\/h1>/);
    expect(html).toContain('Ctrl K');
  });

  it('o primeiro link da página é o "Pular para o conteúdo", que leva ao miolo', () => {
    const primeiroLink = /<a [^>]*>[^<]*<\/a>/.exec(html)?.[0] ?? '';
    expect(primeiroLink).toContain('href="#conteudo"');
    expect(primeiroLink).toContain('Pular para o conteúdo');
    expect(html).toMatch(/<main id="conteudo" tabindex="-1"/);
  });

  it('a ficha do canal está no trilho e abre a troca de canal', () => {
    const ficha = /<button[^>]*aria-label="Canal ativo: Sapo Analítico. Trocar de canal"[^>]*>/.exec(html)?.[0] ?? '';
    expect(ficha).toContain('aria-haspopup="dialog"');
    expect(ficha).toContain('aria-expanded="false"');
  });

  it('o sol/lua, o sino e o chip do canal saíram da casca', () => {
    expect(html).not.toContain('Tema claro');
    expect(html).not.toContain('Tema escuro');
    expect(html).not.toContain('aria-label="Abrir a fila"');
  });

  it('com o vidro ligado e sem live aberta, a aurora fica só com os halos e o vidro desfoca', () => {
    expect(html).toContain('data-aurora="halos"');
    expect(atributo(html, 'data-vidro')).toBe('1');
  });
});

describe('a sala · dentro de uma live', () => {
  it('o trilho recolhe para 64 px e a linha do topo traz voltar, a trilha e a busca', () => {
    const html = casca('/projetos/p1/metadados');
    expect(colunas(html)).toBe('64px 1fr');
    expect(html).toContain('<header');
    expect(html).toContain('aria-label="Etapas da live"');
    expect(html).toMatch(/<a [^>]*aria-label="Voltar para [^"]+"/);
    expect(html).toContain('aria-label="Buscar live, tela ou ação"');
  });

  it('o título da tela vira o h1 da linha do topo', () => {
    expect(casca('/projetos/p1/metadados')).toMatch(/<h1 class="sr-only">Metadados &amp; capas<\/h1>/);
  });

  it.each([
    ['o Editor', '/projetos/p1/cortes/c1'],
    ['a Pós', '/projetos/p1/post-production?corte=c1'],
  ])('%s toca vídeo: nenhum blur e a aurora só com os halos', (_, rota) => {
    const html = casca(rota);
    expect(atributo(html, 'data-vidro')).toBe('0');
    expect(html).toContain('data-aurora="halos"');
    expect(html).not.toMatch(/data-aurora="halos"[^>]*>(?:(?!<\/div>).)*<img/);
  });

  it('fora do vídeo, o vidro da casca volta a desfocar', () => {
    expect(atributo(casca('/projetos/p1/metadados'), 'data-vidro')).toBe('1');
  });
});

describe('a sala · "Reduzir efeitos"', () => {
  it('tira a aurora e o vidro em qualquer tela', async () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => (k === 'upgrade-glass' ? '0' : null), setItem: () => {} },
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.resetModules();
    const { UpgradeShell: Casca } = await import('../UpgradeShell');
    const qc = new QueryClient();
    qc.setQueryData(CANAIS_KEY, { canais: [CANAL] });
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, { initialEntries: ['/projetos'] }, createElement(Casca))),
    );
    expect(html).not.toContain('data-aurora');
    expect(atributo(html, 'data-vidro')).toBe('0');
  });
});

describe('a TopBar deixou de existir', () => {
  it('o arquivo sumiu e a casca não a importa', () => {
    expect(existsSync(resolve(__dirname, '../TopBar.tsx'))).toBe(false);
    expect(readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf8')).not.toContain('TopBar');
  });

  it('os atalhos da casca continuam ligados como antes', () => {
    const casca = readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf8');
    expect(casca).toContain('useAtalhosDaCasca(alternarTrilhoForaDoFoco(parte.trilho, alternar), abrirBusca, gaveta.abrir, chrome);');
    expect(casca).toContain('useAtalhosDeHistorico(irPara, lugaresAnteriores, overlayAberto);');
  });
});
