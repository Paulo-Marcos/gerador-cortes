import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineStatusResponse } from '@/types/models';
import { pipelineStatusKey, useRenderFinal } from '../useRender';
import { assentar, montar } from './domMinimo';

// D-1035: "Renderizar de novo" num corte que já tem video.mp4. O arquivo antigo
// fica no disco durante o render novo, então o status vem com `encode: true` desde
// o primeiro instante. A tela só acaba quando o render novo acaba.

const h = vi.hoisted(() => ({ obterStatus: vi.fn(), renderizar: vi.fn() }));
vi.mock('../api/render', () => ({
  renderApi: { obterPipelineStatus: h.obterStatus, renderizarRemotion: h.renderizar },
}));

const statusComVideoAntigo = (campos: Partial<PipelineStatusResponse>): PipelineStatusResponse => ({
  fases: { raw: true, grade: true, overlays: true, compose: true, render_final: true, encode: true },
  overlays_count: 3,
  tem_etapas_concluidas: true,
  state: 'done',
  progress: 100,
  stage: 'Render final concluído',
  running: false,
  elapsed_seconds: 0,
  error: '',
  ...campos,
});
const rodando = () => statusComVideoAntigo({ state: 'running', running: true, progress: 40, stage: 'Overlays' });
const noFim = (state: PipelineStatusResponse['state']) => statusComVideoAntigo({ state, running: false });

const reacoes = { aoMudarStatus: vi.fn(), aoAcabar: vi.fn() };
let render: ReturnType<typeof useRenderFinal>;
function Sonda() {
  render = useRenderFinal('c1', reacoes);
  return null;
}
let limpar: () => Promise<void> = async () => undefined;

async function abrirComRenderPronto() {
  const qc = new QueryClient();
  qc.setQueryData(pipelineStatusKey('c1'), noFim('done'));
  h.obterStatus.mockResolvedValue(noFim('done'));
  const guardado: Record<string, string> = {};
  const montado = montar(
    <QueryClientProvider client={qc}>
      <Sonda />
    </QueryClientProvider>,
    guardado,
  );
  limpar = montado.limpar;
  await assentar();
  return { qc, guardado };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.obterStatus.mockReset();
  h.renderizar.mockReset();
});
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1035 · Renderizar de novo com o render anterior pronto', () => {
  it('fica na tela enquanto o render novo roda e conclui uma vez, quando ele termina', async () => {
    const { qc, guardado } = await abrirComRenderPronto();
    h.obterStatus.mockResolvedValue(rodando());
    h.renderizar.mockResolvedValue({});

    render.iniciar({ startFrom: 'grade' });
    await assentar();
    expect(reacoes.aoAcabar).not.toHaveBeenCalled();
    expect(guardado['render-final:c1']).toBe('running');

    h.obterStatus.mockResolvedValue(noFim('done'));
    await qc.invalidateQueries({ queryKey: pipelineStatusKey('c1') });
    await assentar();
    expect(reacoes.aoAcabar).toHaveBeenCalledTimes(1);
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(expect.objectContaining({ concluiu: true, assistiu: true }));
    expect(guardado).toEqual({});
  });

  it('se o render novo for cancelado, acaba sem concluir e a tela fica onde está', async () => {
    const { qc, guardado } = await abrirComRenderPronto();
    h.obterStatus.mockResolvedValue(rodando());
    h.renderizar.mockResolvedValue({});
    render.iniciar({ startFrom: 'grade' });
    await assentar();

    h.obterStatus.mockResolvedValue(noFim('cancelled'));
    await qc.invalidateQueries({ queryKey: pipelineStatusKey('c1') });
    await assentar();
    expect(reacoes.aoAcabar).toHaveBeenCalledTimes(1);
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(expect.objectContaining({ concluiu: false, falhou: false }));
    expect(guardado).toEqual({});
  });
});
