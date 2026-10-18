import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { itensDoMenuDoFire } from '../CabecalhoDoFire';
import { transcricaoDoCorteKey } from '../legendasDoCorte';
import type { FireComBruto } from '../shortsApi';

// D-972: o item mora no menu ⋯ da tela do short. Testar só a fábrica do item
// deixaria passar a chamada apagada do menu — aqui é o menu de verdade.

describe('menu ⋯ da tela do short', () => {
  it('traz "Atualizar legendas", e clicar atualiza a legenda daquele corte', () => {
    const qc = new QueryClient();
    for (const id of ['c1', 'c2']) {
      qc.setQueryData(transcricaoDoCorteKey(id), { fonte: 'auto_legenda', palavras: [] });
    }
    const itens = itensDoMenuDoFire({
      qc,
      atualizandoLegendas: false,
      fire: { corte_id: 'c1', shorts: [], bruto_mb: 0 } as unknown as FireComBruto,
      finalizado: false,
      alternandoFinalizado: false,
      onAlternarFinalizado: () => undefined,
      descartando: false,
      onDescartar: () => undefined,
    });

    const item = itens.find((i) => i.label === 'Atualizar legendas');
    expect(item).toBeDefined();
    item?.onClick?.();

    expect(qc.getQueryState(transcricaoDoCorteKey('c1'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(transcricaoDoCorteKey('c2'))?.isInvalidated).toBe(false);
  });
});
