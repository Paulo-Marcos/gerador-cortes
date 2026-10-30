import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTIVOS_APAGADO } from '../motivoApagado';
import { confirmacaoExcluirCorte } from '../regeracaoConfirmacao';

// D-993: o motivo de apagar uma proposta da IA, do lado da tela.

const DOMINIO_DO_BACKEND = resolve(__dirname, '../../../../../backend/app/domain/corte/motivo_apagado.py');

describe('acordo com o domínio do backend', () => {
  it('os motivos são os mesmos, na mesma ordem e com o mesmo rótulo', () => {
    const fonte = readFileSync(DOMINIO_DO_BACKEND, 'utf-8');
    const bloco = /^MOTIVOS_APAGADO[^=]*=\s*\(([\s\S]*?)\n\)/m.exec(fonte);
    expect(bloco, 'MOTIVOS_APAGADO sumiu do domínio do backend').not.toBeNull();
    const noBackend = [...(bloco?.[1] ?? '').matchAll(/"slug": "([^"]+)", "rotulo": "([^"]+)"/g)].map(
      ([, slug, rotulo]) => ({ slug, rotulo }),
    );
    expect(noBackend).toEqual(MOTIVOS_APAGADO);
  });
});

describe('confirmacaoExcluirCorte · motivo (D-993)', () => {
  it('a proposta da IA oferece os motivos, sem obrigar', () => {
    const pedido = confirmacaoExcluirCorte(7, 'O dia em que', 'claude');
    expect(pedido.escolha?.opcoes).toEqual(MOTIVOS_APAGADO);
    expect(pedido.escolha?.pergunta).toContain('opcional');
  });

  it('o corte criado na mão não pergunta motivo', () => {
    expect(confirmacaoExcluirCorte(7, 'O dia em que', null).escolha).toBeUndefined();
    expect(confirmacaoExcluirCorte(7, 'O dia em que').escolha).toBeUndefined();
  });
});

describe('cortesApi.deletarCorte · motivo (D-993)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function urlDoDelete(motivo?: string): Promise<string> {
    const chamadas: Request[] = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        chamadas.push(pedido);
        return new Response('{"message":"ok","corte_id":"c1"}', { status: 200 });
      }),
    );
    const { cortesApi } = await import('../api/cortes');
    await cortesApi.deletarCorte('c1', motivo);
    expect(chamadas[0].method).toBe('DELETE');
    return chamadas[0].url;
  }

  it('leva o motivo escolhido na query', async () => {
    expect(await urlDoDelete('repetido')).toBe('http://api.test/api/cortes/c1?motivo=repetido');
  });

  it('sem motivo, a URL fica a de sempre', async () => {
    expect(await urlDoDelete()).toBe('http://api.test/api/cortes/c1');
  });
});
