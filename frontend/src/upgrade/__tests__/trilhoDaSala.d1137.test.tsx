import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { Canal } from '@/features/channels/api/canais';
import { GlobalRail, TRILHO_ESTREITO, TRILHO_LARGO, type GlobalRailProps } from '../GlobalRail';
import { ListaDeCanais, luzDaFicha } from '../TrocaDeCanal';
import { menuDoTrilho } from '../upgradeRoutes';

// D-1137 (E-069 H-13; DIRECAO §7.0 e §7.9): o trilho de vidro e a troca de canal.

const trilho = (p: Partial<GlobalRailProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/projetos']}>
      <GlobalRail expandido onAlternar={vi.fn()} telaAtual="biblioteca" menu={menuDoTrilho()} {...p} />
    </MemoryRouter>,
  );

const FILA = { titulo: '2 na fila', sub: 'Final · 64%', progresso: 64, onAbrir: vi.fn() };

describe('o trilho', () => {
  it('tem 244 px aberto e 64 px recolhido', () => {
    expect([TRILHO_LARGO, TRILHO_ESTREITO]).toEqual(['244px', '64px']);
  });

  it('é vidro da casca, com os grupos Produção e Inteligência e o pé com a marca', () => {
    const html = trilho();
    expect(html).toMatch(/<aside aria-label="Trilho" class="cc-vidro-casca /);
    expect(html.indexOf('>Produção<')).toBeLessThan(html.indexOf('>Inteligência<'));
    expect(html).toContain('>CutCut<');
    expect(html).toContain('>local · Windows<');
    // Atalhos e Configurações moram no pé, depois da marca do bloco de navegação.
    expect(html.indexOf('>Inteligência<')).toBeLessThan(html.indexOf('>Configurações<'));
  });

  it('o item atual é o único com o ladrilho em íris', () => {
    const html = trilho();
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/bg-iris text-sobre-iris/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/a>).)*bg-iris text-sobre-iris(?:(?!<\/a>).)*Biblioteca/);
  });

  it('a Fila de render fica em Produção e abre a gaveta, com o ponto de erro quando algo falhou', () => {
    const html = trilho({ fila: FILA, filaComErro: true });
    expect(html.indexOf('Fila de render')).toBeLessThan(html.indexOf('>Inteligência<'));
    expect(html).toContain('abrir a fila numa gaveta lateral, você não sai da tela (⌘J)');
    expect(html).toContain('aria-label="Um job falhou"');
    expect(trilho({ fila: FILA })).not.toContain('Um job falhou');
  });

  it('a ficha do canal entra no topo do trilho', () => {
    const html = trilho({ ficha: <span>ficha-do-canal</span> });
    expect(html.indexOf('ficha-do-canal')).toBeLessThan(html.indexOf('>Produção<'));
  });

  it('"Onde eu estava" saiu do trilho (DIRECAO §6)', () => {
    expect(trilho()).not.toContain('Onde eu estava');
  });

  it('recolhido, os itens ficam só no ícone e o title é o rótulo', () => {
    const html = trilho({ expandido: false, fila: FILA });
    expect(html).not.toContain('>Produção<');
    expect(html).not.toContain('>Biblioteca<');
    expect(html).toContain('title="Biblioteca"');
    expect(html).toContain('aria-label="Fila de render: 2 na fila"');
    expect(html).toContain('aria-label="Expandir o trilho"');
  });
});

const canal = (c: Partial<Canal>): Canal =>
  ({ id: 'sapo', nome: 'Sapo Analítico', handle: '@sapo', ativo: false, credito: '', youtube_channel_id: '', paleta: { primaria: '', secundaria: '', acento: '' }, ...c }) as Canal;

describe('a luz da ficha do canal', () => {
  it('a paleta cadastrada vem antes da amostra das capas', () => {
    const luz = luzDaFicha(canal({ paleta: { primaria: '', secundaria: '#ff0000', acento: '#00ff00' }, luz: ['#0000ff', '#ffff00'] }), 'dark');
    const daPaleta = luzDaFicha(canal({ paleta: { primaria: '', secundaria: '#ff0000', acento: '#00ff00' } }), 'dark');
    expect(luz).toEqual(daPaleta);
  });

  it('sem paleta, usa a amostra das capas; sem nada, o anel é neutro', () => {
    expect(luzDaFicha(canal({ luz: ['#0000ff', '#ffff00'] }), 'dark')).not.toBeNull();
    expect(luzDaFicha(canal({}), 'dark')).toBeNull();
  });
});

describe('a troca de canal (§7.9)', () => {
  const lista = () =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MemoryRouter>
            <ListaDeCanais
              canais={[canal({ ativo: true }), canal({ id: 'outro', nome: 'Outro canal', handle: '@outro' })]}
              tema="dark"
              fechar={vi.fn()}
            />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

  it('lista os canais com avatar, nome e handle, e o visto em íris só no ativo', () => {
    const html = lista();
    expect(html).toContain('aria-label="Sapo Analítico"');
    expect(html).toContain('>@outro<');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    const botoes = html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g) ?? [];
    const comVisto = botoes.filter((b) => b.includes('lucide-check'));
    expect(comVisto).toHaveLength(1);
    expect(comVisto[0]).toContain('aria-current="true"');
    expect(comVisto[0]).toContain('text-iris');
  });

  it('oferece "Novo canal", "Configurar o …" e diz o que a troca muda', () => {
    const html = lista();
    expect(html).toContain('Novo canal');
    expect(html).toContain('Configurar o Sapo Analítico');
    expect(html).toContain('muda a biblioteca, as skills e a aurora');
    expect(html).toContain('O feixe e os atalhos continuam os mesmos');
  });

  it('o popover tem 332 px', () => {
    expect(readFileSync(resolve(__dirname, '../TrocaDeCanal.tsx'), 'utf8')).toContain('className="w-[332px]');
  });
});
