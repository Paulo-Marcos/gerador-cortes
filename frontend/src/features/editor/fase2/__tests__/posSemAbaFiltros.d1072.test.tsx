import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { WorkbenchPanelsProvider } from '@/components/workbench/WorkbenchPanelsProvider';
import { abaDaBusca } from '@/features/channels/ChannelsPage';
import { CAMINHO_DO_FILTRO_DO_CANAL, FiltroDoCanal, nomeDoFiltroDoCanal } from '../FiltroDoCanal';

// D-1072: a aba Filtros saiu da Pós. O filtro de render é do canal (RN-25) e se
// edita em Canais → Aplicação; a Pós só diz qual é e leva até lá. A "Fonte dos
// cards", que só existia dentro da aba Filtros, passou para a aba Layout.

const h = vi.hoisted(() => ({ aba: 'layout' as 'cenas' | 'layout' }));

vi.mock('../useEditorFase2', () => ({
  useEditorFase2: () => ({
    abaDireita: h.aba,
    setAbaDireita: vi.fn(),
    cenasFora: [],
    fontePresetSelecionado: 'atual',
    fontePresetMutation: { isPending: false, mutate: vi.fn() },
    layoutYoutube: { regioes: [] },
    segmentosDetectados: [],
    popoverSegmento: null,
    offsetSeg: 0,
    timelineDuration: 60,
    duracaoDoCorte: 60,
    remotionEnabled: true,
  }),
}));
vi.mock('../CenaPlayerPanel', () => ({ CenaPlayerPanel: () => null }));
vi.mock('../SceneTimeline', () => ({ SceneTimeline: () => null }));
vi.mock('../CenasPanel', () => ({ CenasPanel: () => <div>PAINEL DE CENAS</div> }));
vi.mock('../YoutubeLayoutPanel', () => ({ YoutubeLayoutPanel: () => <div>PAINEL DE LAYOUT</div> }));
vi.mock('../AlertaCenasForaDoCorte', () => ({ AlertaCenasForaDoCorte: () => null }));

const { EditorFase2 } = await import('../EditorFase2');

const FILTROS = {
  filtros: [
    { id: 'bypass_dourado_aberto', nome: 'Dourado aberto' },
    { id: 'noir_bypass', nome: 'Noir' },
  ],
};

function clienteComFiltro(filtroId = 'noir_bypass') {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  qc.setQueryData(['app-settings'], { filtro_global_padrao: filtroId });
  qc.setQueryData(['export-filtros'], FILTROS);
  return qc;
}

function desenhar(workbench: boolean, aba: 'cenas' | 'layout' = 'layout') {
  h.aba = aba;
  const corte = { id: 'c1', projeto_id: 'p1', cenas_validadas: 0 } as unknown as Corte;
  const relogio = { agora: () => 0, assinar: () => () => undefined, marcar: () => undefined };
  return renderToStaticMarkup(
    <QueryClientProvider client={clienteComFiltro()}>
      <MemoryRouter>
        <WorkbenchPanelsProvider>
        <EditorFase2
          videoSrc=""
          modoLabel="Cenas"
          corte={corte}
          cenas={[]}
          playerRef={{ current: null }}
          relogio={relogio as never}
          onSeek={vi.fn()}
          onCenasChange={vi.fn()}
          onAbrirStudio={vi.fn()}
          abrindoStudio={false}
          workbench={workbench}
        />
        </WorkbenchPanelsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('D-1072 · a Pós sem a aba Filtros', () => {
  it.each([false, true])('workbench=%s: não há aba nem botão de filtros', (workbench) => {
    const html = desenhar(workbench);
    expect(html).not.toMatch(/>\s*Filtros\s*</);
    expect(html).not.toMatch(/>\s*filtros\s*</);
    expect(html).not.toContain('← layout');
  });

  it('as abas são Cenas e Layout', () => {
    const html = desenhar(false);
    expect(html).toContain('Cenas Remotion');
    expect(html).toContain('Layout');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
  });

  it.each([false, true])('workbench=%s: a Fonte dos cards fica no Layout', (workbench) => {
    const html = desenhar(workbench, 'layout');
    expect(html).toContain('Fonte dos cards');
    expect(html).toContain('PAINEL DE LAYOUT');
  });

  it.each<[boolean, 'cenas' | 'layout']>([
    [false, 'cenas'],
    [false, 'layout'],
    [true, 'layout'],
  ])('workbench=%s, aba %s: a linha do filtro do canal está à vista', (workbench, aba) => {
    const html = desenhar(workbench, aba);
    expect(html).toContain('Filtro do canal (global):');
    expect(html).toContain('Noir');
    expect(html).toContain(`href="${CAMINHO_DO_FILTRO_DO_CANAL}"`);
  });
});

describe('D-1072 · a linha do filtro do canal', () => {
  it('mostra o nome do filtro e leva a Canais → Aplicação', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={clienteComFiltro('bypass_dourado_aberto')}>
        <MemoryRouter>
          <FiltroDoCanal />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain('Filtro do canal (global):');
    expect(html).toContain('Dourado aberto');
    expect(html).toContain('href="/canais?aba=aplicacao"');
  });

  it('o nome vem do catálogo; sem catálogo, o id; sem filtro, nada', () => {
    expect(nomeDoFiltroDoCanal('noir_bypass', FILTROS.filtros)).toBe('Noir');
    expect(nomeDoFiltroDoCanal('noir_bypass', undefined)).toBe('noir_bypass');
    expect(nomeDoFiltroDoCanal(undefined, FILTROS.filtros)).toBeNull();
  });

  it('o link abre Canais direto na aba Aplicação, onde o filtro se edita', () => {
    expect(abaDaBusca(new URLSearchParams('aba=aplicacao'))).toBe('aplicacao');
    expect(abaDaBusca(new URLSearchParams(''))).toBe('canal');
    expect(abaDaBusca(new URLSearchParams('aba=qualquer'))).toBe('canal');
  });
});
