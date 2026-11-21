import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { itensDoMenuDoFire } from '../acoesDoFire';
import { ConteudoDosShorts } from '../ShortsPage';
import type { FireComBruto } from '../shortsApi';

// D-1168 (auditoria, rodada 1): o gerar por corte não pode ser clicado de novo enquanto roda,
// e o "Abrir workspace" diz no title se já há short pronto.

const fire = (extra: Partial<FireComBruto> = {}): FireComBruto =>
  ({
    corte_id: 'c1', numero: 1, titulo: 'Um corte', projeto_id: 'p1', projeto_titulo: 'Live', tema_central: '',
    duracao_seg: 60, bruto_mb: 10, tem_bruto: true, live_em_disco: true, is_fire: true, indicado: false,
    finalizado_em: null, tem_edicao: false, tem_video_final: false, redes: [],
    shorts: { total: 3, sugerido: 3, aprovado: 0, rejeitado: 0, renderizado: 0 },
    ...extra,
  }) as FireComBruto;

const ACOES = { editar: () => undefined, alternarFinalizado: () => undefined, gerar: () => undefined, liveRodando: false, marcando: false };

describe('D-1168 · gerar com IA em voo', () => {
  it('com a geração deste corte rodando, o item desliga e diz que a IA está propondo', () => {
    const [, , gerar] = itensDoMenuDoFire(fire(), { ...ACOES, gerando: true });
    expect(gerar.disabled).toBe(true);
    expect(gerar.label).toBe('A IA está propondo…');
  });

  it('parado, o item está aceso e traz o rótulo do gerar', () => {
    const [, , gerar] = itensDoMenuDoFire(fire(), ACOES);
    expect(gerar.disabled).toBe(false);
    expect(gerar.label).toBe('Gerar shorts com IA');
  });
});

describe('D-1168 · o title do Abrir workspace', () => {
  it('diz se já há short pronto', () => {
    const fires = [
      fire({ corte_id: 'a', shorts: { total: 2, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 1 } }),
      fire({ corte_id: 'b' }),
    ];
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ConteudoDosShorts
            estado={{ fires, andamento: [], carregando: false, filtro: 'todos', busca: '' }}
            acoes={{ aoFiltrar: () => undefined, aoBuscar: () => undefined, aoLimpar: () => undefined }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain('title="Os shorts prontos deste corte, com publicação em massa"');
    expect(html).toContain('title="Ainda não há short renderizado neste corte"');
  });
});
