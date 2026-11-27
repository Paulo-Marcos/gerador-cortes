import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Corte, MetadadoCorte, StatusExportCorte } from '@/types/models';
import { COR_DO_SELO } from '@/upgrade/SeloDeEstado';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { assentar, montar } from '../../editor/__tests__/domMinimo';
import { metadataKey } from '../useMetadataCard';

// D-1174: desde o D-1167 só o corte aberto monta o MetadataCard, e a lista dependia dele para
// saber de cada corte. Nos fechados a miniatura sumia e a bolinha "parcial" virava "vazio".
// Aqui o card fica de fora: o que a lista mostra tem de vir de uma leitura dela.

const h = vi.hoisted(() => ({
  cortes: [] as unknown[],
  status: [] as unknown[],
  chrome: undefined as unknown,
  servidor: {} as Record<string, unknown>,
  lidos: [] as string[],
}));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: unknown) => {
    h.chrome = chrome;
  },
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: h.cortes, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', async (original) => ({
  ...(await original<typeof import('@/features/projeto-detalhe/useProjetoDetalhe')>()),
  useProjeto: () => ({ data: { id: 'p1', titulo_live: 'Live', youtube_url: '' } }),
  useExportStatus: () => ({ data: { cortes: h.status } }),
}));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: { canais: [] } }) }));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));
vi.mock('../MetadataCard', () => ({ MetadataCard: () => null }));
vi.mock('../api/metadados', () => ({
  metadadosApi: {
    obterMetadado: async (corteId: string) => {
      h.lidos.push(corteId);
      return h.servidor[corteId];
    },
  },
}));

const { MetadataPage } = await import('../MetadataPage');
const { useMetadadosDosCortes } = await import('../useMetadadosDosCortes');

afterEach(() => {
  h.cortes = [];
  h.status = [];
  h.chrome = undefined;
  h.servidor = {};
  h.lidos = [];
});

const corte = (id: string, numero: number) =>
  ({ id, projeto_id: 'p1', numero, status: 'aprovado', titulo_proposto: `Corte ${numero}`, inicio_hms: '00:00:00' }) as unknown as Corte;

const metadado = (corteId: string, extra: Partial<MetadadoCorte> = {}) =>
  ({ id: `m-${corteId}`, corte_id: corteId, titulo_youtube: '', texto_capa: '', prompt_thumbnail: '', thumbnail_path: '', ...extra }) as MetadadoCorte;

const vazio = (corteId: string) => metadado(corteId);
const parcial = (corteId: string, extra: Partial<MetadadoCorte> = {}) =>
  metadado(corteId, { texto_capa: 'CAPA', thumbnail_path: `thumbnails/thumb_${corteId}.png`, ...extra });
const completo = (corteId: string) =>
  parcial(corteId, { titulo_youtube: 'Título', descricao_youtube: 'Descrição' });

const doStatus = (corteId: string, extra: Partial<StatusExportCorte> = {}) =>
  ({ corte_id: corteId, metadados_completos: false, thumbnail_pronta: false, thumbnail_path: null, ...extra }) as StatusExportCorte;

/** Abre a tela no corte 1, com o cache que a lista teria depois de ler `metadados`. */
function lista(metadados: MetadadoCorte[]) {
  h.cortes = [corte('c1', 1), corte('c2', 2), corte('c3', 3)];
  const qc = new QueryClient();
  for (const meta of metadados) qc.setQueryData(metadataKey(meta.corte_id), meta);
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projetos/p1/metadados?corte=c1']}>
        <Routes>
          <Route path="/projetos/:id/metadados" element={<MetadataPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return (h.chrome as Chrome).lista!;
}

describe('D-1174 · a lista de cortes de Metadados', () => {
  it('os dois cortes fechados mostram a miniatura e o estado: parcial e completo', () => {
    const { itens } = lista([vazio('c1'), parcial('c2'), completo('c3')]);

    expect(itens.map((item) => item.ativo)).toEqual([true, false, false]);
    expect(itens[1].thumb).toContain('thumb_c2.png');
    expect(itens[1].dot).toBe(COR_DO_SELO.aviso.cor);
    expect(itens[2].thumb).toContain('thumb_c3.png');
    expect(itens[2].dot).toBe(COR_DO_SELO.ok.cor);
  });

  it('o corte fechado sem nada fica vazio e sem miniatura; só o prompt já é parcial', () => {
    const { itens } = lista([completo('c1'), vazio('c2'), metadado('c3', { prompt_thumbnail: 'Um prompt' })]);

    expect(itens[1]).toMatchObject({ thumb: undefined, dot: COR_DO_SELO.inerte.cor });
    expect(itens[2]).toMatchObject({ thumb: undefined, dot: COR_DO_SELO.aviso.cor });
  });

  it('antes de o metadado chegar, a miniatura e o completo vêm do status de exportação', () => {
    h.status = [doStatus('c2', { metadados_completos: true, thumbnail_pronta: true, thumbnail_path: 'thumbnails/thumb_c2.png' })];

    const { itens } = lista([]);

    expect(itens[1].thumb).toContain('thumb_c2.png');
    expect(itens[1].dot).toBe(COR_DO_SELO.ok.cor);
  });

  it('capa removida não volta pelo status de exportação atrasado', () => {
    h.status = [doStatus('c2', { thumbnail_pronta: true, thumbnail_path: 'thumbnails/thumb_c2.png' })];

    const { itens } = lista([vazio('c2')]);

    expect(itens[1].thumb).toBeUndefined();
  });
});

describe('D-1174 · a leitura dos metadados da lista', () => {
  it('lê o metadado de cada corte, sem depender de card montado', async () => {
    h.servidor = { c1: vazio('c1'), c2: parcial('c2'), c3: completo('c3') };
    const cortes = [corte('c1', 1), corte('c2', 2), corte('c3', 3)];
    let lidoPelaLista: Record<string, MetadadoCorte> = {};
    function Sonda() {
      lidoPelaLista = useMetadadosDosCortes(cortes);
      return null;
    }

    const { limpar } = montar(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Sonda />
      </QueryClientProvider>,
    );
    await assentar();
    await limpar();

    expect(h.lidos.sort()).toEqual(['c1', 'c2', 'c3']);
    expect(lidoPelaLista).toEqual(h.servidor);
  });
});
