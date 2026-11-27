import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoDeErroProps } from '@/components/ui/estado-de-erro';
import { esperarEstadoDeErro, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';

const h = vi.hoisted(() => ({ erros: [] as unknown[], estado: {} as Record<string, unknown> }));

vi.mock('@/components/ui/estado-de-erro', async (original) => {
  const real = await original<typeof import('@/components/ui/estado-de-erro')>();
  return {
    EstadoDeErro: (props: EstadoDeErroProps) => {
      h.erros.push(props);
      return createElement(real.EstadoDeErro, props);
    },
  };
});
vi.mock('../useEditorPage', () => ({ useEditorPage: () => h.estado }));

import { EditorPage } from '../EditorPage';

const consulta = (extra: object) => ({
  isLoading: false,
  isError: false,
  data: undefined,
  error: null,
  refetch: vi.fn(),
  ...extra,
});
const caida = () => consulta({ isError: true, error: quedaDeRede() });
const montar = () => renderToStaticMarkup(<EditorPage />);
const TITULO = 'Não foi possível carregar o corte';

beforeEach(() => {
  h.erros = [];
  h.estado = { projetoId: 'p1', corteId: 'c1', cortes: [], corteUI: null };
});

describe('D-1204 · Editor com o backend fora', () => {
  it('não fica em "Carregando o corte…": diz o que falhou e tentar refaz as duas consultas', () => {
    const corteQuery = caida();
    const cortesQuery = caida();
    Object.assign(h.estado, { corteQuery, cortesQuery });
    const html = montar();
    expect(html).not.toContain('Carregando o corte');
    esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], TITULO).aoTentar?.();
    expect(corteQuery.refetch).toHaveBeenCalledTimes(1);
    expect(cortesQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('sem corte na URL e a lista de cortes caída: erro, não "ainda não tem cortes"', () => {
    Object.assign(h.estado, { corteId: '', corteQuery: consulta({}), cortesQuery: caida() });
    const html = montar();
    expect(html).not.toContain('Esta live ainda não tem cortes');
    esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], TITULO);
  });

  it('carregando continua carregando', () => {
    Object.assign(h.estado, {
      corteQuery: consulta({ isLoading: true }),
      cortesQuery: consulta({}),
    });
    expect(montar()).toContain('Carregando o corte');
  });
});
