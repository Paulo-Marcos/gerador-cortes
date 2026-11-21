import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TabelaDeFrequencia, TabelaDePadroes, ThumbnailPadroesPage } from '../ThumbnailPadroesPage';

// D-1176 (E-069 H-22; DIRECAO §7.8): Padrões de capa usa `Tabela`; antes da primeira análise
// a tela mostra o estado vazio e aponta a ação do cabeçalho.

vi.mock('@/upgrade/UpgradeChrome', () => ({ useDefinirChrome: () => undefined }));

describe('Padrões de capa (§7.8)', () => {
  it('antes da análise: estado vazio que aponta "Analisar padrões"', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ThumbnailPadroesPage />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain('data-estado="vazio"');
    expect(html).toContain('Analisar padrões');
    expect(html).not.toContain('<table');
  });

  it('os padrões saem numa Tabela, a força num selo com a forma do tom', () => {
    const html = renderToStaticMarkup(
      <TabelaDePadroes
        padroes={[
          { eixo: 'cor', padrao: 'Fundo escuro', forca: 'alta', evidencia: '5 de 6' },
          { eixo: 'texto', padrao: 'Poucas palavras', forca: 'baixa', evidencia: '' },
        ]}
      />,
    );
    expect(html).toContain('<table');
    expect(html).toContain('Fundo escuro');
    expect(html).toContain('5 de 6');
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html).toContain('[--c:var(--cc-ok)]');
    expect(html).toContain('[--c:var(--cc-fg-3)]');
  });

  it('a frequência por eixo sai numa Tabela, com o "×N" só quando repete', () => {
    const html = renderToStaticMarkup(
      <TabelaDeFrequencia
        eixos={[
          {
            eixo: 'cor',
            rotulo: 'Cor',
            ocorrencias: [
              { valor: 'azul', contagem: 3 },
              { valor: 'verde', contagem: 1 },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain('<table');
    expect(html).toContain('×3');
    expect(html).not.toContain('×1');
  });
});
