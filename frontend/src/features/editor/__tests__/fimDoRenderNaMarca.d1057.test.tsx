import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineStatusResponse } from '@/types/models';
import { desfechoDoRender, pipelineStatusKey, useRenderFinal } from '../useRender';
import { assentar, montar } from './domMinimo';

// D-1057: o render que acaba sem refazer o vídeo. A marca sai e a tela é avisada do
// fim, mas sem concluir: com `assistiu`, concluir é o que leva à Revisão.

const h = vi.hoisted(() => ({ obterStatus: vi.fn(), renderizar: vi.fn() }));
vi.mock('../api/render', () => ({
  renderApi: { obterPipelineStatus: h.obterStatus, renderizarRemotion: h.renderizar },
}));

const statusComVideoAntigo = (campos: Partial<PipelineStatusResponse>): PipelineStatusResponse => ({
  fases: { raw: true, grade: true, overlays: true, compose: true, render_final: true, encode: true },
  overlays_count: 3,
  tem_etapas_concluidas: true,
  state: 'running',
  progress: 40,
  stage: 'Overlays',
  running: true,
  elapsed_seconds: 12,
  error: '',
  ...campos,
});

const reacoes = { aoMudarStatus: vi.fn(), aoAcabar: vi.fn() };
let render: ReturnType<typeof useRenderFinal>;
function Sonda() {
  render = useRenderFinal('c1', reacoes);
  return null;
}
let limpar: () => Promise<void> = async () => undefined;

beforeEach(() => {
  vi.clearAllMocks();
  h.obterStatus.mockReset();
  h.renderizar.mockReset();
});
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1057 · o render acaba sem o vídeo novo', () => {
  it.each(['parcial', 'idle'] as const)('%s: acaba sem concluir, com o vídeo antigo no disco', (state) => {
    expect(desfechoDoRender(statusComVideoAntigo({ state, running: false }))).toEqual({
      acabou: true,
      concluiu: false,
      falhou: false,
    });
  });

  it.each(['parcial', 'idle'] as const)('%s depois do pedido: tira a marca e não conclui', async (state) => {
    const qc = new QueryClient();
    h.obterStatus.mockResolvedValue(statusComVideoAntigo({}));
    h.renderizar.mockResolvedValue({});
    const guardado: Record<string, string> = {};
    const montado = montar(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
      guardado,
    );
    limpar = montado.limpar;
    await assentar();

    render.iniciar({ startFrom: 'grade' });
    await assentar();
    expect(guardado['render-final:c1']).toBe('running');
    expect(reacoes.aoAcabar).not.toHaveBeenCalled();

    h.obterStatus.mockResolvedValue(statusComVideoAntigo({ state, running: false }));
    await qc.invalidateQueries({ queryKey: pipelineStatusKey('c1') });
    await assentar();

    expect(reacoes.aoAcabar).toHaveBeenCalledTimes(1);
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(
      expect.objectContaining({ concluiu: false, falhou: false, assistiu: true }),
    );
    expect(guardado).toEqual({});
  });
});
