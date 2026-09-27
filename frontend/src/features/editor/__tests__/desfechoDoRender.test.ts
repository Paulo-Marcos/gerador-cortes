import { describe, expect, it } from 'vitest';
import type { PipelineStatusResponse } from '@/types/models';
import { desfechoDoRender } from '../useRender';

// D-727: a regra que a Pós e a Revisão copiavam para saber quando largar a
// marca `render-final:{id}` — agora num lugar só.

function status(campos: Partial<PipelineStatusResponse> = {}): PipelineStatusResponse {
  return {
    fases: { raw: true, grade: true, overlays: true, compose: false, render_final: false, encode: false },
    overlays_count: 3,
    tem_etapas_concluidas: true,
    state: 'running',
    progress: 40,
    stage: 'Overlays',
    running: true,
    elapsed_seconds: 30,
    error: '',
    ...campos,
  };
}

describe('desfechoDoRender', () => {
  it('rodando não acabou', () => {
    expect(desfechoDoRender(status())).toEqual({ acabou: false, concluiu: false, falhou: false });
  });

  it('done conclui', () => {
    expect(desfechoDoRender(status({ state: 'done', running: false }))).toMatchObject({
      acabou: true,
      concluiu: true,
    });
  });

  it('o encode pronto também conclui, mesmo sem o estado dizer', () => {
    const fases = { ...status().fases, encode: true };
    expect(desfechoDoRender(status({ fases }))).toMatchObject({ acabou: true, concluiu: true });
  });

  it('erro acaba com falha', () => {
    expect(desfechoDoRender(status({ state: 'error', running: false }))).toEqual({
      acabou: true,
      concluiu: false,
      falhou: true,
    });
  });

  it('backend ocioso sem avisar também libera a marca', () => {
    expect(desfechoDoRender(status({ state: 'idle', running: false }))).toEqual({
      acabou: true,
      concluiu: false,
      falhou: false,
    });
  });
});
