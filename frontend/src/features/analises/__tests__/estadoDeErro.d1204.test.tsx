import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoDeErroProps } from '@/components/ui/estado-de-erro';
import { esperarEstadoDeErro, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';

const h = vi.hoisted(() => ({ erros: [] as unknown[], q: {} as Record<string, unknown> }));

vi.mock('@/components/ui/estado-de-erro', async (original) => {
  const real = await original<typeof import('@/components/ui/estado-de-erro')>();
  return {
    EstadoDeErro: (props: EstadoDeErroProps) => {
      h.erros.push(props);
      return createElement(real.EstadoDeErro, props);
    },
  };
});
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../useAnalises', () => ({
  useYoutubeStatsStatus: () => h.q.status,
  useProjetosAnalises: () => h.q.projetos,
  useTelemetriaCortes: () => h.q.telemetria,
  useLevantamentoDuracao: () => h.q.duracao,
  useLevantamentoTitulo: () => h.q.titulo,
  useSincronizarYoutube: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('../useLlmCalls', () => ({ useLlmCalls: () => h.q.llm }));

import { FaixaDeKpis } from '../AnalisesPage';
import { PropostaFinalTab } from '../PropostaFinalTab';
import { YoutubeDesempenhoTab } from '../YoutubeDesempenhoTab';

const consulta = (extra: object = {}) => ({
  isLoading: false,
  isError: false,
  data: undefined,
  error: null,
  refetch: vi.fn(),
  ...extra,
});
const caida = () => consulta({ isError: true, error: quedaDeRede() });
const montar = (no: React.ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{no}</QueryClientProvider>);
const erros = () => h.erros as EstadoDeErroProps[];
const refetchDe = (nome: string) => (h.q[nome] as { refetch: () => void }).refetch;

beforeEach(() => {
  h.erros = [];
  h.q = {
    status: caida(), projetos: caida(), telemetria: consulta(),
    duracao: caida(), titulo: caida(), llm: caida(),
  };
});

describe('D-1204 · Análises com o backend fora', () => {
  it('os KPIs não dizem "Sem dados": avisam e tentar refaz as duas consultas', () => {
    const html = montar(<FaixaDeKpis />);
    expect(html).not.toContain('Sem dados');
    esperarEstadoDeErro(html, erros(), 'Não consegui carregar os números das análises').aoTentar?.();
    expect(refetchDe('status')).toHaveBeenCalledTimes(1);
    expect(refetchDe('llm')).toHaveBeenCalledTimes(1);
  });

  it('Proposta × Final: a lista de lives caída não pede para escolher uma live', () => {
    const html = montar(<PropostaFinalTab />);
    expect(html).not.toContain('Escolha uma live para comparar');
    esperarEstadoDeErro(html, erros(), 'Não consegui carregar a lista de lives').aoTentar?.();
    expect(refetchDe('projetos')).toHaveBeenCalledTimes(1);
  });

  it('Desempenho YouTube: erro no lugar de "Ainda não há estatísticas"', () => {
    const html = montar(<YoutubeDesempenhoTab />);
    expect(html).not.toContain('Ainda não há estatísticas');
    esperarEstadoDeErro(html, erros(), 'Não consegui carregar o desempenho do YouTube').aoTentar?.();
    for (const nome of ['status', 'duracao', 'titulo']) {
      expect(refetchDe(nome)).toHaveBeenCalledTimes(1);
    }
  });

  it('sem erro, os KPIs voltam', () => {
    h.q.status = consulta();
    h.q.llm = consulta();
    expect(montar(<FaixaDeKpis />)).toContain('Sem dados');
    expect(erros()).toHaveLength(0);
  });
});
