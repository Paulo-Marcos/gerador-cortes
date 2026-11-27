import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoDeErroProps } from '@/components/ui/estado-de-erro';
import { esperarEstadoDeErro, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';

const h = vi.hoisted(() => ({
  erros: [] as unknown[],
  refetch: null as unknown as () => void,
  canais: null as unknown,
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
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));

const caida = () => ({
  isLoading: false, isError: true, isSuccess: false, isFetching: false,
  data: undefined, error: quedaDeRede(), refetch: h.refetch,
});
const parada = () => ({ isPending: false, isError: false, error: null, mutate: vi.fn() });

vi.mock('../useChannels', async (original) => ({
  ...(await original<typeof import('../useChannels')>()),
  useCanais: () => h.canais ?? caida(),
  usePalcoDoCanal: () => caida(),
  useTemas: () => caida(),
  useTemaDoCanal: () => ({ data: undefined }),
  useSelecionarTema: () => parada(),
}));
vi.mock('../useEditorialScaffolds', () => ({
  useEditorialScaffolds: () => caida(),
  useEditarScaffold: () => parada(),
  useResetarScaffold: () => parada(),
}));
vi.mock('../useEditorialSkills', () => ({
  useEditorialSkills: () => caida(),
  useVersoesSkill: () => ({ data: undefined }),
  useEditarSkill: () => parada(),
  useResetarSkill: () => parada(),
  useReverterSkill: () => parada(),
}));
vi.mock('../usePromptsUtilitarios', () => ({
  usePromptsUtilitarios: () => caida(),
  useEditarPromptUtilitario: () => parada(),
  useResetarPromptUtilitario: () => parada(),
}));
vi.mock('../useRankingPesos', () => ({
  useRankingPesos: () => caida(),
  useSalvarRankingPesos: () => parada(),
  useResetarRankingPesos: () => parada(),
}));
vi.mock('../useEscalonamento', () => ({
  useEscalonamento: () => caida(),
  useSalvarPublico: () => parada(),
  useSalvarDestino: () => parada(),
  useResetarEscalonamento: () => parada(),
}));
vi.mock('../useMotivosDeExclusao', () => ({
  useMotivosDeExclusao: () => caida(),
  useEditarMotivosDeExclusao: () => ({ acrescentar: parada(), mostrar: parada() }),
}));
vi.mock('../useAmbiente', () => ({ useAmbiente: () => caida() }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => caida(),
}));

import { ChannelThemeSection } from '../ChannelThemeSection';
import { subDosCanais } from '../useChannels';
import { PalcoComponentesSection } from '../EdicaoDoPalco';
import { EditorialScaffoldsSection } from '../EditorialScaffoldsSection';
import { EditorialSkillsSection } from '../EditorialSkillsSection';
import { EscalonamentoSection } from '../EscalonamentoSection';
import { FaixaDoShortSection } from '../FaixaDoShortSection';
import { MotivosDeExclusaoSection } from '../MotivosDeExclusaoSection';
import { PreRequisitosSection } from '../PreRequisitosSection';
import { PromptsUtilitariosSection } from '../PromptsUtilitariosSection';
import { RankingPesosSection } from '../RankingPesosSection';
import { SituacaoDosCanais } from '../SituacaoDosCanais';

const montar = (no: React.ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{no}</QueryClientProvider>);

beforeEach(() => {
  h.erros = [];
  h.refetch = vi.fn();
  h.canais = null;
});

describe('D-1204 · Configurações com o backend fora', () => {
  it.each([
    ['canais', () => <SituacaoDosCanais carregando={false} erro={quedaDeRede()} vazio={false} onTentarDeNovo={h.refetch} onCriar={() => {}} />, 'Não consegui carregar os canais'],
    ['tema', () => <ChannelThemeSection />, 'Não consegui carregar os temas'],
    ['scaffolds', () => <EditorialScaffoldsSection />, 'Não consegui carregar os scaffolds'],
    ['skills', () => <EditorialSkillsSection />, 'Não consegui carregar as skills'],
    ['horários', () => <EscalonamentoSection />, 'Não consegui carregar os horários'],
    ['faixa', () => <FaixaDoShortSection />, 'Não consegui carregar a faixa dos shorts'],
    ['motivos', () => <MotivosDeExclusaoSection />, 'Não consegui carregar os motivos de exclusão'],
    ['pré-requisitos', () => <PreRequisitosSection />, 'Não consegui checar os pré-requisitos'],
    ['prompts', () => <PromptsUtilitariosSection />, 'Não consegui carregar os prompts'],
    ['pesos', () => <RankingPesosSection />, 'Não consegui carregar os pesos'],
  ])('%s: frase, tentar de novo e role=alert', (_nome, secao, titulo) => {
    const html = montar(secao());
    esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], titulo).aoTentar?.();
    expect(h.refetch).toHaveBeenCalled();
  });

  it('palco: com o canal conhecido e o palco caído, avisa e deixa tentar de novo', () => {
    h.canais = { isSuccess: true, data: { canais: [{ id: 'c1', ativo: true }] } };
    const html = montar(<PalcoComponentesSection />);
    esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], 'Não consegui carregar o palco').aoTentar?.();
    expect(h.refetch).toHaveBeenCalled();
  });

  it('o cabeçalho não afirma "0 canais" quando a lista não veio', () => {
    expect(subDosCanais(0, undefined, true)).toBe('sem a lista de canais');
    expect(subDosCanais(2, 'Sapo', false)).toBe('2 canais · ativo: Sapo');
    expect(subDosCanais(0, undefined, false)).toBe('0 canais · nenhum ativo');
  });
});
