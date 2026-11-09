import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { WorkbenchPanelsProvider } from '@/components/workbench/WorkbenchPanelsProvider';
import { FiltroDoCanal } from '../FiltroDoCanal';

// D-1086: o filtro do canal (RN-25) era uma faixa fixa no pé da coluna das cenas, em
// duas linhas, e tirava ~57 px da lista. O Paulo: "O filtro do canal não precisa
// aparecer fixo". Ele vira um chip na linha que já existe (as abas, o cabeçalho do
// painel): o nome segue à vista e o clique leva a Canais → Aplicação.

const h = vi.hoisted(() => ({ aba: 'cenas' as 'cenas' | 'layout' }));

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

function cliente() {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  qc.setQueryData(['app-settings'], { filtro_global_padrao: 'noir_bypass' });
  qc.setQueryData(['export-filtros'], { filtros: [{ id: 'noir_bypass', nome: 'Noir' }] });
  return qc;
}

function desenhar(workbench: boolean, aba: 'cenas' | 'layout') {
  h.aba = aba;
  const corte = { id: 'c1', projeto_id: 'p1', cenas_validadas: 0 } as unknown as Corte;
  const relogio = { agora: () => 0, assinar: () => () => undefined, marcar: () => undefined };
  return renderToStaticMarkup(
    <QueryClientProvider client={cliente()}>
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

describe('D-1086 · o filtro do canal sem faixa fixa', () => {
  it.each<'cenas' | 'layout'>(['cenas', 'layout'])('aba %s: o chip mora na linha das abas, fora do tablist', (aba) => {
    const html = desenhar(false, aba);
    const linha = html.indexOf('data-testid="linha-das-abas"');
    const tablist = html.indexOf('role="tablist"', linha);
    const fimDoTablist = html.indexOf('</div>', tablist);
    const chip = html.indexOf('data-testid="filtro-do-canal"');
    // Na mesma linha: depois da abertura da linha das abas e antes do conteúdo da aba.
    expect(linha).toBeGreaterThan(-1);
    expect(chip).toBeGreaterThan(linha);
    expect(chip).toBeLessThan(html.indexOf('PAINEL DE', linha));
    // Fora do tablist: o ARIA só admite abas nele (auditoria do #349).
    expect(chip).toBeGreaterThan(fimDoTablist);
    expect(html.slice(tablist, fimDoTablist).match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/data-testid="filtro-do-canal"/g)).toHaveLength(1);
  });

  it('workbench: o chip mora no cabeçalho do painel de layout, antes do conteúdo', () => {
    const html = desenhar(true, 'layout');
    expect(html.indexOf('data-testid="filtro-do-canal"')).toBeGreaterThan(html.indexOf('LAYOUT YOUTUBE'));
    expect(html.indexOf('data-testid="filtro-do-canal"')).toBeLessThan(html.indexOf('PAINEL DE LAYOUT'));
  });

  it('é um link compacto: o nome à vista, o rótulo inteiro no leitor de tela e no hover', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente()}>
        <MemoryRouter>
          <FiltroDoCanal />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toMatch(/^<a [^>]*href="\/canais\?aba=aplicacao"/);
    expect(html).not.toContain('<p');
    expect(html).toContain('title="Filtro do canal (global): Noir. Alterar em Canais → Aplicação"');
    expect(html).toMatch(/<span class="sr-only">Filtro do canal \(global\):<\/span>/);
    expect(html).toMatch(/<strong[^>]*>Noir<\/strong>/);
  });
});
