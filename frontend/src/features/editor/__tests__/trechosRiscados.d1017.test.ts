import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comDesviosSalvos } from '../useTrechosRiscados';
import { mensagemDosTrechosGerados } from '../useGeracoesDaIa';
import type { Corte, Desvio } from '@/types/models';

const MARCA: Desvio = { inicio_hms: '00:00:10.000', fim_hms: '00:00:12.000', motivo: 'm' };

describe('comDesviosSalvos', () => {
  it('sem borda pendente, só executa a ação', async () => {
    const salvar = vi.fn();
    const limpar = vi.fn();
    const acao = vi.fn(async () => undefined);

    await comDesviosSalvos({}, salvar, limpar, acao);

    expect(salvar).not.toHaveBeenCalled();
    expect(limpar).not.toHaveBeenCalled();
    expect(acao).toHaveBeenCalledOnce();
  });

  it('com borda pendente, grava antes: senão salvar depois ressuscitaria a marca riscada', async () => {
    const ordem: string[] = [];
    const pendente = { desvios: [MARCA], fim_seg: 30 } as Partial<Corte>;
    const salvar = vi.fn(async (d: Desvio[]) => {
      ordem.push(`salvar:${d.length}`);
    });
    const limpar = vi.fn((resto: Partial<Corte>) => {
      ordem.push(`limpar:${Object.keys(resto).join()}`);
    });
    const acao = vi.fn(async () => {
      ordem.push('acao');
    });

    await comDesviosSalvos(pendente, salvar, limpar, acao);

    expect(ordem).toEqual(['salvar:1', 'limpar:fim_seg', 'acao']);
  });
});

describe('mensagemDosTrechosGerados', () => {
  it('diz quantos entraram e o total', () => {
    expect(mensagemDosTrechosGerados({ novos: 3, total_desvios: 9, recusados: 0 })).toBe(
      '+3 novo(s) trecho(s) via IA (total: 9).',
    );
  });

  it('avisa quando o app recusou marca, para ninguém achar que sumiu', () => {
    expect(mensagemDosTrechosGerados({ novos: 3, total_desvios: 9, recusados: 2 })).toBe(
      '+3 novo(s) trecho(s) via IA (total: 9). 2 recusado(s): a citação não confere. Estão em Riscados.',
    );
  });

  it('nenhum novo continua dizendo isso', () => {
    expect(mensagemDosTrechosGerados({ novos: 0, total_desvios: 4, recusados: 0 })).toBe(
      'Nenhum trecho novo a remover (total: 4).',
    );
  });
});

describe('cortesApi: riscados', () => {
  let chamadas: Request[] = [];

  beforeEach(() => {
    chamadas = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        chamadas.push(pedido);
        return new Response('{}', { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('restaurar manda o índice do riscado', async () => {
    const { cortesApi } = await import('../api/cortes');
    await cortesApi.restaurarDesvio('c1', 2);

    expect(chamadas[0].url).toBe('http://api.test/api/cortes/c1/restaurar-desvio');
    expect(await chamadas[0].json()).toEqual({ riscado_index: 2 });
  });

  it('desfazer a rodada não precisa de corpo', async () => {
    const { cortesApi } = await import('../api/cortes');
    await cortesApi.desfazerRodada('c1');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/cortes/c1/desfazer-rodada');
  });
});
