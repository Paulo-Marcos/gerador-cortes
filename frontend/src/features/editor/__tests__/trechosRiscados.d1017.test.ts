import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDesvioChange } from '../editorEditState';
import { comDesviosSalvos, umaDeCadaVez } from '../useTrechosRiscados';
import { mensagemDosTrechosGerados } from '../useGeracoesDaIa';
import type { Corte, Desvio } from '@/types/models';

const MARCA = { inicio_hms: '00:00:10.000', fim_hms: '00:00:12.000', motivo: 'm', categoria: 'repeticao' } as const;

function historico(pendente: Partial<Corte>) {
  return { getPresent: () => pendente, reset: vi.fn() };
}

describe('comDesviosSalvos', () => {
  it('sem borda pendente, só executa a ação', async () => {
    const h = historico({});
    const salvar = vi.fn();
    const acao = vi.fn(async () => undefined);

    await comDesviosSalvos(h, salvar, acao);

    expect(salvar).not.toHaveBeenCalled();
    expect(h.reset).not.toHaveBeenCalled();
    expect(acao).toHaveBeenCalledOnce();
  });

  it('com borda pendente, grava antes: senão salvar depois ressuscitaria a marca riscada', async () => {
    const ordem: string[] = [];
    const h = historico({ desvios: [MARCA], fim_seg: 30 } as Partial<Corte>);
    h.reset.mockImplementation((resto: Partial<Corte>) => {
      ordem.push(`reset:${Object.keys(resto).join()}`);
    });
    const salvar = vi.fn(async (d: Desvio[]) => {
      ordem.push(`salvar:${d.length}`);
    });
    const acao = vi.fn(async () => {
      ordem.push('acao');
    });

    await comDesviosSalvos(h, salvar, acao);

    expect(ordem).toEqual(['salvar:1', 'reset:fim_seg', 'acao']);
  });

  it('o Ctrl+Z não traz a lista velha de volta: o histórico recomeça, em vez de empilhar', async () => {
    const h = { ...historico({ desvios: [MARCA] } as Partial<Corte>), set: vi.fn() };

    await comDesviosSalvos(h, vi.fn(async () => undefined), vi.fn(async () => undefined));

    expect(h.reset).toHaveBeenCalledOnce();
    expect(h.set).not.toHaveBeenCalled();
  });
});

describe('umaDeCadaVez', () => {
  it('ignora o clique que chega com outra ação em voo', async () => {
    let soltar: () => void = () => undefined;
    const primeira = vi.fn(() => new Promise<void>((r) => { soltar = r; }));
    const segunda = vi.fn(async () => undefined);
    const estados: boolean[] = [];
    const fila = umaDeCadaVez((o) => estados.push(o));

    const voando = fila(primeira);
    await fila(segunda);
    soltar();
    await voando;

    expect(primeira).toHaveBeenCalledOnce();
    expect(segunda).not.toHaveBeenCalled();
    expect(estados).toEqual([true, false]);
  });

  it('libera a fila quando a ação falha', async () => {
    const fila = umaDeCadaVez(() => undefined);
    await expect(fila(async () => { throw new Error('x'); })).rejects.toThrow('x');
    const depois = vi.fn(async () => undefined);

    await fila(depois);

    expect(depois).toHaveBeenCalledOnce();
  });
});

describe('applyDesvioChange (D-1017)', () => {
  const CITADA = { ...MARCA, inicio_texto: 'começo', fim_texto: 'final' };

  it('a borda ajustada perde a citação daquele lado, e só dele', () => {
    const fim = applyDesvioChange([CITADA], {}, 0, CITADA.inicio_hms, '00:00:15.000')!.desvios![0];
    expect(fim.inicio_texto).toBe('começo');
    expect(fim.fim_texto).toBeUndefined();

    const inicio = applyDesvioChange([CITADA], {}, 0, '00:00:09.000', CITADA.fim_hms)!.desvios![0];
    expect(inicio.inicio_texto).toBeUndefined();
    expect(inicio.fim_texto).toBe('final');
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
