import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { trilhaDaTela } from '@/upgrade/upgradeRoutes';
import { ShortsDesteCorte } from '../ShortsDesteCorte';
import type { FireComBruto } from '../shortsApi';
import { FIRES_KEY, rotulosDoFire } from '../useFires';

// D-1051: o corte e os shorts não se conheciam, nos dois sentidos.

const FIRE = {
  corte_id: 'c9',
  numero: 9,
  projeto_id: 'p1',
  projeto_titulo: 'Live de teste',
  shorts: { sugerido: 2, aprovado: 1, renderizado: 2, rejeitado: 3, total: 8 },
} as unknown as FireComBruto;

function link(fires?: FireComBruto[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, enabled: false } } });
  if (fires) qc.setQueryData(FIRES_KEY, { fires });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ShortsDesteCorte corteId="c9" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('D-1051 · do corte para os shorts', () => {
  it('leva à curadoria do corte e conta os shorts, sem os rejeitados', () => {
    const html = link([FIRE]);
    expect(html).toContain('href="/shorts/c9"');
    expect(html).toContain('Shorts deste corte (5)');
  });

  it('sem a contagem carregada, o caminho continua lá e não inventa número', () => {
    const html = link();
    expect(html).toContain('href="/shorts/c9"');
    expect(html).toContain('Shorts deste corte<');
  });

  it('só com rejeitados, não anuncia zero', () => {
    const soRejeitados = { ...FIRE, shorts: { ...FIRE.shorts, total: 3, rejeitado: 3 } } as FireComBruto;
    expect(link([soRejeitados])).toContain('Shorts deste corte<');
  });

  it('outro corte não empresta a contagem', () => {
    expect(link([{ ...FIRE, corte_id: 'outro' } as FireComBruto])).toContain('Shorts deste corte<');
  });
});

describe('D-1051 · dos shorts para o corte', () => {
  const rotulos = rotulosDoFire(FIRE);

  it('as migalhas das duas telas passam pela linha do corte na live', () => {
    for (const [tela, ultima] of [['fire', 'Curar'], ['prateleira', 'Prateleira']] as const) {
      expect(trilhaDaTela(tela, rotulos)).toEqual([
        { texto: 'Shorts', to: '/shorts' },
        { texto: 'Live de teste', to: '/projetos/p1' },
        { texto: 'Corte #9', to: '/projetos/p1?corte=c9' },
        { texto: ultima },
      ]);
    }
  });

  it('com o Fire ainda carregando, a trilha não inventa a origem', () => {
    expect(rotulosDoFire(undefined)).toEqual([]);
    expect(trilhaDaTela('fire', rotulosDoFire(undefined))).toEqual([
      { texto: 'Shorts', to: '/shorts' },
      { texto: 'Curar' },
    ]);
  });
});
