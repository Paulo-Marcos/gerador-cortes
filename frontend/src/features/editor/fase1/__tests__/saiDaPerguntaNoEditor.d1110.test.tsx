import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';
import type { Corte, Desvio } from '@/types/models';

// D-1110: a D-1105 fez a pergunta 2 da aba Decisões ler a janela da tela, a mesma da
// faixa "O bruto vai ter". A ligação mora no EditorFase1 (`janela={corte}` para o
// RightTabsPanel), e a prop é opcional: sem ela o título da pergunta perde o "sai" em
// silêncio. Os testes da D-1105 montam o painel direto; este monta o editor inteiro e
// lê os dois "sai" da mesma tela.

// A janela salva (useCorte): 1000 → 2211.
vi.mock('@/features/editor/useCortes', async () => {
  const actual = await vi.importActual<typeof import('@/features/editor/useCortes')>('@/features/editor/useCortes');
  return {
    ...actual,
    useCorte: () => ({ data: { projeto_id: 'p1', trechos_da_ultima_rodada: 1, inicio_seg: 1000, fim_seg: 2211 } }),
  };
});
vi.mock('@/features/diarizacao/useDiarizacao', async () => {
  const actual = await vi.importActual<typeof import('@/features/diarizacao/useDiarizacao')>(
    '@/features/diarizacao/useDiarizacao',
  );
  return { ...actual, useFalantes: () => ({ data: { falantes: {} } }), useDiarizarCorte: () => ({ mutate: vi.fn(), isPending: false }) };
});
// O player e a onda dependem do navegador; o que importa aqui é o painel da direita e a faixa.
vi.mock('../PlayerPanel', () => ({ PlayerPanel: () => null }));
vi.mock('../TimelinePanel', () => ({ TimelinePanel: () => null }));

const { EditorFase1 } = await import('../EditorFase1');

// Um trecho de 148,4 s: com a janela inteira a líquida fica fracionária.
const TRECHO: Desvio = { inicio_hms: '00:16:45.000', fim_hms: '00:19:13.400', motivo: 'Sai do assunto.', origem: 'claude' };

/** Os dois "sai" da mesma tela do editor: o da faixa e o do título da pergunta 2. */
function osDoisSai(janelaDaTela: { inicio_seg: number; fim_seg: number }) {
  const corte = { id: 'c1', ...janelaDaTela, desvios: [TRECHO], transcricao_corte: [] } as unknown as Corte;
  const props = { corte, audioOffsetMs: 0, pending: {}, selectedDesvioIdx: null, currentTime: 0 } as unknown as Parameters<
    typeof EditorFase1
  >[0];
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TooltipProvider>
          <EditorFase1 {...props} />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const faixa = html.slice(html.indexOf('aria-label="O bruto vai ter"'));
  const inicioDaPergunta = html.indexOf('<section aria-label="Pergunta sobre os desvios de assunto"');
  const cabecalhoDaPergunta = inicioDaPergunta < 0 ? '' : html.slice(inicioDaPergunta, html.indexOf('</header>', inicioDaPergunta));
  return {
    daFaixa: faixa.match(/>(sai [^<]*?) em [^<]*</)?.[1],
    daPergunta: cabecalhoDaPergunta.match(/>(sai [^<]*)</)?.[1],
  };
}

describe('D-1110 · no editor, a pergunta 2 e a faixa dizem o mesmo sai', () => {
  it('com a janela salva na tela, as duas dizem "sai 2:29"', () => {
    const { daFaixa, daPergunta } = osDoisSai({ inicio_seg: 1000, fim_seg: 2211 });

    expect(daFaixa).toBe('sai 2:29');
    expect(daPergunta).toBe(daFaixa);
  });

  it('com a borda mexida e não salva (I 0,4 s depois), as duas seguem a janela da tela: "sai 2:28"', () => {
    const { daFaixa, daPergunta } = osDoisSai({ inicio_seg: 1000.4, fim_seg: 2211 });

    expect(daFaixa).toBe('sai 2:28');
    expect(daPergunta).toBe(daFaixa);
  });
});
