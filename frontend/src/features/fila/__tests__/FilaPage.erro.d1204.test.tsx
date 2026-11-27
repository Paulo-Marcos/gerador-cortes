import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoDeErroProps } from '@/components/ui/estado-de-erro';
import { SEM_BACKEND, esperarEstadoDeErro } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';

const h = vi.hoisted(() => ({
  erros: [] as unknown[],
  fila: {} as Record<string, unknown>,
  subs: [] as string[],
}));

vi.mock('@/components/ui/estado-de-erro', async (original) => {
  const real = await original<typeof import('@/components/ui/estado-de-erro')>();
  return {
    EstadoDeErro: (props: EstadoDeErroProps) => {
      h.erros.push(props);
      return createElement(real.EstadoDeErro, props);
    },
  };
});
vi.mock('@/upgrade/UpgradeChrome', () => ({
  useDefinirChrome: (chrome: { sub: string }) => h.subs.push(chrome.sub),
}));
vi.mock('@/shared/filaGlobal/useWorkbenchQueue', () => ({ useWorkbenchQueue: () => h.fila }));

import FilaPage from '../FilaPage';

const tentarDeNovo = vi.fn();
const montar = () => renderToStaticMarkup(<FilaPage />);
const TITULO = 'Não consegui consultar a fila';

beforeEach(() => {
  h.erros = [];
  h.subs = [];
  tentarDeNovo.mockClear();
  h.fila = {
    jobs: [],
    removeJob: vi.fn(),
    cancelJob: vi.fn(),
    clearAll: vi.fn(),
    falha: SEM_BACKEND,
    carregando: false,
    tentarDeNovo,
  };
});

describe('D-1204 · Fila com o backend fora', () => {
  it('diz o que falhou e tentar refaz a consulta', () => {
    esperarEstadoDeErro(montar(), h.erros as EstadoDeErroProps[], TITULO).aoTentar?.();
    expect(tentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('NÃO mostra o estado vazio nem conta zero jobs como se soubesse', () => {
    const html = montar();
    expect(html).not.toContain('Nada na fila');
    expect(html).not.toContain('data-estado="vazio"');
    expect(h.subs.at(-1)).toBe('sem resposta do backend');
  });

  it('com jobs guardados, o erro aparece acima deles e avisa que é o último estado conhecido', () => {
    h.fila.jobs = [
      {
        id: 'render:1', tipo: 'render', familia: 'midia', corteId: 'c1', projetoId: 'p1',
        alvo: '265', rotuloTipo: 'render', rotulo: 'corte 7 → render', estado: 'rodando',
        progresso: 42, etapa: 'compondo', erro: '', terminalDesde: null,
        iniciadoEm: 0, atualizadoEm: 0, historico: [], ausenteDesde: null,
      },
    ];
    const html = montar();
    expect(esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], TITULO).motivo).toContain(
      'último estado conhecido',
    );
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('aria-label="Jobs da fila"'));
  });

  it('antes da primeira resposta é carregando, não vazio', () => {
    Object.assign(h.fila, { falha: null, carregando: true });
    const html = montar();
    expect(html).toContain('data-estado="carregando"');
    expect(html).not.toContain('Nada na fila');
  });
});
