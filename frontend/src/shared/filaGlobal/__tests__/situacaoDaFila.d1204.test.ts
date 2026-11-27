import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { SEM_BACKEND, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';
import { situacaoDaFila } from '../useConsultaDaFila';

describe('D-1204 · a situação da consulta da fila', () => {
  it('continua em falha enquanto a próxima volta do relógio está em voo (sem piscar para vazio)', async () => {
    let cair = true;
    const observador = new QueryObserver(new QueryClient(), {
      queryKey: ['fila-d1204'],
      queryFn: () => (cair ? Promise.reject(quedaDeRede()) : new Promise<never>(() => {})),
      retry: false,
    });
    const soltar = observador.subscribe(() => {});
    await observador.refetch();
    expect(situacaoDaFila(observador.getCurrentResult())).toEqual({ falha: SEM_BACKEND, carregando: false });

    cair = false;
    void observador.refetch();
    const emVoo = observador.getCurrentResult();
    expect(emVoo.isError).toBe(false); // a armadilha do TanStack v5 sem dado
    expect(situacaoDaFila(emVoo)).toEqual({ falha: SEM_BACKEND, carregando: false });
    soltar();
  });

  it('antes da primeira resposta é carregando; com dado novo, a falha some', () => {
    expect(situacaoDaFila({ error: null, errorUpdatedAt: 0, dataUpdatedAt: 0 })).toEqual({
      falha: null,
      carregando: true,
    });
    expect(situacaoDaFila({ error: null, errorUpdatedAt: 1, dataUpdatedAt: 2 })).toEqual({
      falha: null,
      carregando: false,
    });
  });
});
