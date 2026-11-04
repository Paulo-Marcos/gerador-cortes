import { describe, expect, it } from 'vitest';
import type { PipelineStatusResponse } from '@/types/models';
import { desfechoDoRender } from '../useRender';

// D-1035: o backend deixa o video.mp4 antigo publicado enquanto o render novo
// roda, então `fases.encode` fica true desde o primeiro status. Só o arquivo
// não pode dar o render por concluído: o render novo conclui quando ele termina.

function statusComVideoAntigo(campos: Partial<PipelineStatusResponse> = {}): PipelineStatusResponse {
  return {
    fases: { raw: true, grade: true, overlays: true, compose: true, render_final: true, encode: true },
    overlays_count: 3,
    tem_etapas_concluidas: true,
    state: 'running',
    progress: 1,
    stage: 'Render final enfileirado',
    running: true,
    elapsed_seconds: 0,
    error: '',
    ...campos,
  };
}

describe('desfechoDoRender com o vídeo do render anterior no disco', () => {
  it('render novo rodando não acabou, mesmo com o video.mp4 antigo', () => {
    expect(desfechoDoRender(statusComVideoAntigo())).toEqual({
      acabou: false,
      concluiu: false,
      falhou: false,
    });
  });

  it('o render novo concluído (done) conclui', () => {
    expect(desfechoDoRender(statusComVideoAntigo({ state: 'done', running: false }))).toMatchObject({
      acabou: true,
      concluiu: true,
    });
  });

  it('com a falha do render novo, o video antigo não vira conclusão', () => {
    expect(desfechoDoRender(statusComVideoAntigo({ state: 'error', running: false }))).toMatchObject({
      acabou: true,
      concluiu: false,
      falhou: true,
    });
  });

  it('cancelado com o vídeo antigo no disco acaba sem concluir', () => {
    expect(desfechoDoRender(statusComVideoAntigo({ state: 'cancelled', running: false }))).toEqual({
      acabou: true,
      concluiu: false,
      falhou: false,
    });
  });
});
