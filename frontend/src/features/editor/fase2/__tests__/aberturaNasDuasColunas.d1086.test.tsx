import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { WorkbenchPanelsProvider } from '@/components/workbench/WorkbenchPanelsProvider';

// D-1086: a abertura editorial saiu do `EditorFase2.tsx` para o próprio arquivo e passou
// a fechar numa linha. Ela continua montada nas DUAS colunas das cenas (a aba direita,
// que a Pós usa, e o painel esquerdo do workbench), logo acima da lista. Sem este teste,
// apagá-la de uma das montagens passava pelos 826 testes do editor (auditoria do #349).

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

const CORTE = {
  id: 'c1',
  projeto_id: 'p1',
  cenas_validadas: 0,
  contextualizacao: 'A renda da terra explica o preço da comida.',
  frase_gancho_texto: 'Ninguém fala nisso na escola.',
  frase_gancho_hms: '01:23:45',
} as unknown as Corte;

function desenhar(workbench: boolean, corte: Corte = CORTE) {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  const relogio = { agora: () => 0, assinar: () => () => undefined, marcar: () => undefined };
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
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

describe('D-1086 · a abertura editorial nas duas colunas das cenas', () => {
  it.each([
    ['a aba direita (a Pós)', false],
    ['o painel esquerdo (workbench)', true],
  ])('%s: a abertura, com o texto do corte, logo acima da lista', (_nome, workbench) => {
    const html = desenhar(workbench);
    const abertura = html.indexOf('data-testid="abertura-editorial"');
    expect(abertura).toBeGreaterThan(-1);
    expect(abertura).toBeLessThan(html.indexOf('PAINEL DE CENAS'));
    expect(html.match(/data-testid="abertura-editorial"/g)).toHaveLength(1);
    expect(html).toContain('A renda da terra explica o preço da comida.');
    expect(html).toContain('01:23:45');
  });

  it('corte sem contextualização nem gancho: nada acima da lista, nas duas', () => {
    const vazio = { ...CORTE, contextualizacao: '', frase_gancho_texto: '' } as Corte;
    expect(desenhar(false, vazio)).not.toContain('abertura-editorial');
    expect(desenhar(true, vazio)).not.toContain('abertura-editorial');
  });
});
