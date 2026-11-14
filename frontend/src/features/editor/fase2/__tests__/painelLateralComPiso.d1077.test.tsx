import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';

// D-1077: na Pós em 1280 px, o "Validar o plano (faltam 1)" saía cortado. O botão
// não encolhe (o rótulo é vocabulário do produto), mas o painel lateral podia ser
// arrastado até 22% do grupo — 172 px com o trilho aberto —, e a <section> do
// CenasPanel, com overflow-hidden, cortava o que passava. O painel agora tem um
// piso em px: abaixo dele o rodapé não cabe.

const h = vi.hoisted(() => ({
  paineis: [] as Array<{ id?: string; minSize?: number; defaultSize?: number }>,
  piso: 22,
}));

vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => null,
  Panel: (p: { id?: string; minSize?: number; defaultSize?: number; children: ReactNode }) => {
    h.paineis.push({ id: p.id, minSize: p.minSize, defaultSize: p.defaultSize });
    return <div>{p.children}</div>;
  },
}));

vi.mock('../pisoDoPainelLateral', async (importOriginal) => {
  const real = await importOriginal<typeof import('../pisoDoPainelLateral')>();
  return { ...real, usePisoDoPainelLateral: () => h.piso };
});

vi.mock('../useEditorFase2', () => ({
  useEditorFase2: () => ({
    abaDireita: 'cenas',
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
vi.mock('../YoutubeLayoutPanel', () => ({ YoutubeLayoutPanel: () => null }));
vi.mock('../AlertaCenasForaDoCorte', () => ({ AlertaCenasForaDoCorte: () => null }));
vi.mock('../FiltroDoCanal', () => ({ FiltroDoCanal: () => null }));

const { EditorFase2 } = await import('../EditorFase2');
const { PISO_DO_PAINEL_LATERAL_PX, pisoEmPercentual } = await import('../pisoDoPainelLateral');

function desenharAPos() {
  h.paineis = [];
  const corte = { id: 'c1', projeto_id: 'p1', cenas_validadas: 0 } as unknown as Corte;
  const relogio = { agora: () => 0, assinar: () => () => undefined, marcar: () => undefined };
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
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
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const [principal, lateral] = h.paineis;
  return { principal, lateral };
}

describe('D-1077 · o painel das cenas não encolhe abaixo do rodapé', () => {
  it('o piso cobre o rodapé inteiro: Validar com dois dígitos, respiros e bordas', () => {
    // Medido na Pós a 1280 px: o botão "Validar o plano (faltam 1)" tem 181 px
    // e não encolhe; o rodapé soma 20 px de padding, 16 de gap e 2 de borda.
    // Com dois dígitos o rótulo ganha ~7 px: 226 px. Abaixo disso, cortava.
    expect(PISO_DO_PAINEL_LATERAL_PX).toBeGreaterThanOrEqual(181 + 7 + 20 + 16 + 2);
  });

  it('em 1280 px com o trilho aberto (grupo de 780 px), 22% não basta: o piso sobe', () => {
    // 22% de 780 = 172 px — o "Validar o plano (falta" cortado da captura.
    const piso = pisoEmPercentual(780);
    expect(piso).toBeGreaterThan(22);
    expect((piso / 100) * 780).toBeGreaterThanOrEqual(PISO_DO_PAINEL_LATERAL_PX - 0.01);
  });

  it('em tela larga o mínimo de antes fica: 22% de 1500 px já passa do piso', () => {
    expect(pisoEmPercentual(1500)).toBe(22);
  });

  it('nunca passa de 60%: o vídeo e a timeline têm o mínimo deles (40%)', () => {
    expect(pisoEmPercentual(300)).toBe(60);
  });

  it('sem medida ainda (primeiro render, SSR), usa o mínimo de antes', () => {
    expect(pisoEmPercentual(0)).toBe(22);
  });

  it('o painel lateral da Pós recebe o piso medido como mínimo', () => {
    h.piso = 31.5;
    const { lateral } = desenharAPos();
    expect(lateral.minSize).toBe(31.5);
  });

  it('os painéis têm id: o layout salvo não se perde a cada piso novo', () => {
    // Sem id, o react-resizable-panels monta a chave do layout salvo com o
    // minSize; um mínimo que muda com a janela trocaria a chave e jogaria fora
    // o tamanho que o operador arrastou.
    const { principal, lateral } = desenharAPos();
    expect(principal.id).toBeTruthy();
    expect(lateral.id).toBeTruthy();
    expect(principal.id).not.toBe(lateral.id);
  });
});
