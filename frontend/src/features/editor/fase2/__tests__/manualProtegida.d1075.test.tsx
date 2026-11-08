import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { conferenciaDaOrigemKey, corteKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import { confirmacaoRegerarCenas } from '../../regeracaoConfirmacao';
import { cenasEmGeracaoKey } from '../../useGeracoesDaIa';
import { descreverDescartadas, contarDescartadas } from '../LegendaDoPlano';
import { LegendaDaOrigem, SeloDaOrigem } from '../CenaComOrigem';
import { CenasPanel } from '../CenasPanel';

// D-1075 (RN-39): gerar de novo mantém as cenas manuais e descarta a cena da IA que cai
// em cima de uma delas. Com a proteção no backend, o rótulo promete o que ela faz, a Pós
// diz quantas cenas ficaram de fora, e a confirmação de gerar de novo para de dizer que
// a edição manual se perde.

vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  geracaoIaApi: { gerarCenasClaude: vi.fn(), cenasEmGeracao: vi.fn().mockResolvedValue({ em_geracao: false }) },
  useUltimaGeracao: () => ({ data: undefined }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../useGravarCenas', () => ({ useGravarCenas: () => () => undefined }));
// O tooltip do Radix pede `window`; aqui ele só repassa o filho.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

const MANUAL: CenaRemotion = { tipo: 'enfase', texto: 'Escrita à mão', inicio: 20, fim: 24, manual: true };

function painel(cenasRemotion: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(corteKey('c1'), { id: 'c1', cenas_remotion: cenasRemotion });
  const versao = qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0;
  qc.setQueryData(conferenciaDaOrigemKey('c1', versao), { avisos: [] });
  qc.setQueryData(cenasEmGeracaoKey('c1'), { corte_id: 'c1', em_geracao: false });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <CenasPanel
        corteId="c1"
        projetoId="p1"
        cenas={[MANUAL]}
        cenaAtivaIdx={-1}
        onSeek={vi.fn()}
        onCenasChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('D-1075 · o rótulo da cena manual promete a proteção', () => {
  it('o selo diz "manual · a IA não mexe"', () => {
    expect(renderToStaticMarkup(<SeloDaOrigem origem="manual" />)).toContain('· manual · a IA não mexe');
  });

  it('a legenda também', () => {
    expect(renderToStaticMarkup(<LegendaDaOrigem />)).toContain('manual, a IA não mexe');
  });

  it('o painel mostra o rótulo novo na cena manual', () => {
    expect(painel({ formato: 'cortes', cenas: [MANUAL] })).toContain('manual · a IA não mexe');
  });
});

describe('D-1075 · a frase das cenas da IA descartadas', () => {
  it('lê a contagem do plano gravado; plano antigo em lista ou sem a chave não tem', () => {
    expect(contarDescartadas({ cenas: [], descartadas_pelas_manuais: 2 })).toBe(2);
    expect(contarDescartadas({ cenas: [] })).toBe(0);
    expect(contarDescartadas([])).toBe(0);
    expect(contarDescartadas(undefined)).toBe(0);
  });

  it('uma frase curta, no singular e no plural; sem descartes, nada', () => {
    expect(descreverDescartadas(1)).toBe('1 cena da IA ficou de fora porque caía em cima de uma cena manual.');
    expect(descreverDescartadas(3)).toBe('3 cenas da IA ficaram de fora porque caíam em cima de cenas manuais.');
    expect(descreverDescartadas(0)).toBeNull();
  });

  it('o painel diz ao operador, sem modal, quando a geração descartou cenas', () => {
    const html = painel({ formato: 'cortes', cenas: [MANUAL], descartadas_pelas_manuais: 2 });

    expect(html).toContain('2 cenas da IA ficaram de fora porque caíam em cima de cenas manuais.');
    expect(html).toMatch(/<p role="status"[^>]*>.*ficaram de fora/);
    expect(html).not.toContain('role="dialog"');
  });

  it('sem descarte, o painel não fala nisso', () => {
    expect(painel({ formato: 'cortes', cenas: [MANUAL] })).not.toContain('ficou de fora');
    expect(painel({ formato: 'cortes', cenas: [MANUAL] })).not.toContain('ficaram de fora');
  });
});

describe('D-1075 · a confirmação de gerar de novo', () => {
  it('diz que as manuais ficam, e não que a edição manual se perde', () => {
    const descricao = confirmacaoRegerarCenas(4)?.descricao ?? '';

    expect(descricao).toContain('as manuais ficam');
    expect(descricao).not.toMatch(/edicoes manuais/i);
  });
});
