import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-991: quem propôs o corte (D-988) também aparece na bancada: em cada linha
// de "Cortes da live" e no corte aberto, no topo.
let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

const umCorte = (id: string, numero: number, origem: string | null) =>
  ({ id, numero, titulo_proposto: `Corte ${numero}`, status: 'proposto', origem_analise: origem }) as unknown as Corte;

function publicar(cortes: Corte[], aberto: Corte) {
  publicado = null;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={cortes}
          corte={aberto}
          exportStatus={[]}
          caminhoDoCorte={() => '/'}
          sub=""
          fire={false}
          sujo={false}
          salvando={false}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return publicado as Chrome | null;
}
const html = (no: React.ReactNode) => renderToStaticMarkup(<>{no}</>);

describe('BancadaChrome — selo de quem propôs o corte', () => {
  const claude = umCorte('c1', 1, 'claude');
  const gemini = umCorte('c2', 2, 'gemini');
  const semOrigem = umCorte('c3', 3, null);

  it('cada linha da lista leva o selo da própria origem', () => {
    const itens = publicar([claude, gemini, semOrigem], claude)!.lista!.itens;
    expect(html(itens[0].selo)).toContain('Proposto pelo Claude');
    expect(html(itens[1].selo)).toContain('Proposto pelo Gemini');
    expect(html(itens[2].selo)).toBe('');
  });

  it('o corte aberto mostra o selo no topo', () => {
    expect(html(publicar([claude, gemini], gemini)!.atual!.selo)).toContain('Proposto pelo Gemini');
    expect(html(publicar([semOrigem], semOrigem)!.atual!.selo)).toBe('');
  });
});
