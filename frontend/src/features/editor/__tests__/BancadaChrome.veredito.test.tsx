import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-864: num corte `processado`, o principal dizia "Aprovar corte" — o rótulo
// só olhava `aprovado` —, mas o clique (ou o Enter) chamava o toggle, que
// trata `processado` como aprovado e DEVOLVIA o corte a proposto. O rótulo
// tem de seguir a mesma regra do toggle.
let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

function principal(status: Corte['status'], onAprovar = vi.fn()) {
  // Zerado a cada caso: sem isto, um caso sem barra publicada leria a do anterior.
  publicado = null;
  const corte = { id: 'c1', numero: 1, titulo_proposto: 'Corte', status } as unknown as Corte;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={[corte]}
          corte={corte}
          exportStatus={[]}
          caminhoDoCorte={() => '/'}
          sub=""
          fire={false}
          sujo={false}
          salvando={false}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={onAprovar}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // o render reatribui `publicado` pelo mock; o tsc não enxerga isso
  return (publicado as Chrome | null)?.barra?.primario;
}

describe('BancadaChrome — rótulo do veredito', () => {
  it.each([
    ['proposto', 'Aprovar corte'],
    ['aprovado', 'Aprovado'],
    ['processado', 'Aprovado'],
  ] as const)('status %s: o principal diz "%s"', (status, rotulo) => {
    expect(principal(status)?.texto).toBe(rotulo);
  });

  it('o principal (clique e Enter) chama o veredito da tela', () => {
    const onAprovar = vi.fn();
    principal('processado', onAprovar)?.onClick?.();
    expect(onAprovar).toHaveBeenCalledTimes(1);
  });
});
