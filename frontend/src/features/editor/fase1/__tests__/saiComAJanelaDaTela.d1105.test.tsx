import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';
import type { Desvio } from '@/types/models';
import { descreverOBruto } from '../descreverOBruto';

// D-1105, rodada 1 da auditoria: a pergunta 2 lia a janela salva (useCorte) e a faixa a
// da tela (corteUI). Com o I marcado no player e ainda não salvo, a pergunta dizia
// "sai 2:29" e a faixa "sai 2:28 em 1 trecho". A janela agora vem da tela, como a da faixa.

// A janela salva: 1000 → 2211.
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

const { RightTabsPanel } = await import('../RightTabsPanel');

const noop = vi.fn();
const TRECHO: Desvio = { inicio_hms: '00:16:45.000', fim_hms: '00:19:13.400', motivo: 'Sai do assunto.', origem: 'claude' };
// A janela da tela: o I marcado no player, 0,4 s depois, ainda sem salvar.
const DA_TELA = { inicio_seg: 1000.4, fim_seg: 2211 };

function perguntaDois(): string {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TooltipProvider>
          <RightTabsPanel
            corteId="c1"
            janela={DA_TELA}
            desvios={[TRECHO]}
            selectedDesvioIdx={null}
            onSeek={noop}
            onGerarManual={noop}
            onGerarTrechosIA={noop}
            pendingTrechos={{}}
            transcricao={[]}
            currentTime={0}
            onAtualizarTranscricao={noop}
            transcricaoAtualizando={false}
          />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const inicio = html.indexOf('<section aria-label="Pergunta sobre os desvios de assunto"');
  return html.slice(inicio, html.indexOf('</header>', inicio));
}

describe('D-1105 · a pergunta 2 lê a janela da tela, como a faixa', () => {
  it('com o I marcado e não salvo, a pergunta diz o sai da faixa ("sai 2:28"), não o da janela salva', () => {
    const daFaixa = descreverOBruto({ ...DA_TELA, desvios: [TRECHO] }, 0).sai.replace(/ em .*$/, '');

    expect(daFaixa).toBe('sai 2:28');
    expect(perguntaDois()).toContain(`>${daFaixa}<`);
  });
});
