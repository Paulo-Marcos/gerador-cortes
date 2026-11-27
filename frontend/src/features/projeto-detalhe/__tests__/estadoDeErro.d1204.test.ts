import { describe, expect, it, vi } from 'vitest';
import { SEM_BACKEND, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';
import { falhaDaConsulta } from '../cortesDoWorkspace';

// A tela (`role="alert"` e "Tentar de novo") é a `FalhaDosCortes`, coberta no teste dela (D-1032).
describe('D-1204 · Cortes da live com o backend fora', () => {
  it('o motivo chega traduzido e tentar de novo refaz a consulta', () => {
    const refetch = vi.fn();
    const falha = falhaDaConsulta({ isError: true, error: quedaDeRede(), refetch });
    expect(falha?.mensagem).toBe(SEM_BACKEND);
    falha?.tentarDeNovo();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
