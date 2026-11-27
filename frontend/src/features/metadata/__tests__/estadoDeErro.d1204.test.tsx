import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EstadoDeErroProps } from '@/components/ui/estado-de-erro';
import { esperarEstadoDeErro, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';

const h = vi.hoisted(() => ({ erros: [] as unknown[], refetch: null as unknown as () => void }));

vi.mock('@/components/ui/estado-de-erro', async (original) => {
  const real = await original<typeof import('@/components/ui/estado-de-erro')>();
  return {
    EstadoDeErro: (props: EstadoDeErroProps) => {
      h.erros.push(props);
      return createElement(real.EstadoDeErro, props);
    },
  };
});
vi.mock('@/upgrade/UpgradeChrome', () => ({ useDefinirChrome: () => undefined }));
vi.mock('@/features/editor/useCortes', () => ({
  useCortesProjeto: () => ({
    isLoading: false, isError: true, data: undefined, error: quedaDeRede(), refetch: h.refetch,
  }),
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useExportStatus: () => ({ data: undefined }),
  useProjeto: () => ({ data: undefined }),
}));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: undefined }) }));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));

import { MetadataPage } from '../MetadataPage';

describe('D-1204 · Metadados com o backend fora', () => {
  it('diz o que falhou em português e tentar refaz a consulta', () => {
    h.refetch = vi.fn();
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/p/p1']}>
        <Routes>
          <Route path="/p/:id" element={<MetadataPage />} />
        </Routes>
      </MemoryRouter>,
    );
    esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], 'Erro ao carregar cortes').aoTentar?.();
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });
});
