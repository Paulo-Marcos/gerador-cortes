import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { AvisoDeSincronia } from '@/upgrade/AvisoDeSincronia';
import { GlobalRail } from '@/upgrade/GlobalRail';
import { menuDoTrilho } from '@/upgrade/upgradeRoutes';
import { ConteudoDaBiblioteca } from '../BibliotecaPage';

// D-1160 · O chip provisório da D-1148 saiu da Biblioteca: o aviso mora no pé do trilho.

describe('a Biblioteca sem o chip de sincronização', () => {
  it('a tela não desenha mais o selo de sincronização', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MemoryRouter>
            <ConteudoDaBiblioteca estado={{ tipo: 'vazio', onBuscarLives: () => undefined, onLigarCanal: () => undefined }} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(html).not.toMatch(/data-tom="(ok|curso)"[^>]*>(<[^>]*>)*(<\/[^>]*>)*(Sincronizado|Atualizando)/);
  });

  it('o arquivo do chip saiu e a página não o importa', () => {
    const pagina = readFileSync(resolve(__dirname, '../BibliotecaPage.tsx'), 'utf-8');
    expect(pagina).not.toContain('SincroniaDaBiblioteca');
  });

  it('na Biblioteca, o aviso aparece no trilho', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/projetos']}>
        <GlobalRail expandido onAlternar={vi.fn()} telaAtual="biblioteca" menu={menuDoTrilho()} sincronia="sincronizado" />
      </MemoryRouter>,
    );
    expect(html).toContain('data-sincronia="sincronizado"');
    expect(renderToStaticMarkup(<AvisoDeSincronia sincronia="sincronizado" expandido />)).toContain('Sincronizado');
  });
});
