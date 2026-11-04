import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1038 · a página inteira, com o hook de verdade e só as fronteiras trocadas
// (queries, API, chrome). A reauditoria da D-1032 mostrou que o TanStack Query,
// numa consulta SEM dado, volta a `pending` com `error: null` ao refazer a busca
// ("Tentar de novo") e na primeira carga: sem erro e sem lista não é "live sem
// cortes". Testar peça por peça deixou remover a ligação de `FalhaDosCortes` e
// de `listaIndisponivel` sem reprovar nada; por isso aqui a ligação é o alvo.
const h = vi.hoisted(() => ({
  fase: 'pendente' as 'pendente' | 'erro' | 'ok',
  cortes: [] as unknown[],
  chrome: undefined as unknown,
}));

vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: unknown) => {
    h.chrome = chrome;
  },
}));
const mutacao = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({
    data: { id: 'p1', status: 'analisado', arquivos_limpos: false, titulo_live: 'Live' },
    refetch: vi.fn(),
  }),
  useExportStatus: () => ({ data: { cortes: [] }, refetch: vi.fn() }),
  useProjetoProgressoWS: () => ({}),
  useAbrirPastaProjeto: mutacao,
  useRefazerTranscricao: mutacao,
  useAnalisarDesviosTodos: () => ({ disparar: vi.fn(), disparado: false }),
  useUploadYouTube: mutacao,
  useMarcarPublicadoYouTube: mutacao,
  useLiberarPublicacao: mutacao,
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  // Imita o TanStack Query 5: "Tentar de novo" numa consulta sem dado derruba
  // o erro e volta a `pending`.
  useCortesProjeto: () => ({
    data: h.fase === 'ok' ? h.cortes : undefined,
    isError: h.fase === 'erro',
    error: h.fase === 'erro' ? new Error('Erro interno do servidor') : null,
    refetch: () => {
      if (h.fase === 'erro') h.fase = 'pendente';
    },
  }),
  useReordenarCortes: mutacao,
}));
vi.mock('@/features/diarizacao/useDiarizacao', () => ({ useAnaliseClaudeEmAndamento: () => false }));
vi.mock('@/hooks/useWarmupWaveforms', () => ({ useWarmupWaveforms: () => undefined }));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: { canais: [] } }) }));

// Filhos pesados (puxam o Remotion) que não fazem parte do que se prova aqui.
vi.mock('../CorteLinhaAp', () => ({ CorteLinhaAp: () => null }));
vi.mock('@/features/editor/AdicionarCorteModal', () => ({ AdicionarCorteModal: () => null }));
vi.mock('@/features/projeto-detalhe/AnaliseIaModal', () => ({ AnaliseIaModal: () => null }));
vi.mock('@/features/projeto-detalhe/AuditoriaAnaliseModal', () => ({ AuditoriaAnaliseModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarTiktokModal', () => ({ PublicarTiktokModal: () => null }));
vi.mock('@/upgrade/MolduraDeVideo', () => ({ MolduraDeVideo: () => null }));

const { default: WorkspaceProjetoPage } = await import('../WorkspaceProjetoPage');

afterEach(() => {
  vi.clearAllMocks();
  h.fase = 'pendente';
  h.cortes = [];
  h.chrome = undefined;
});

function renderizar(): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/projetos/p1']}>
        <Routes>
          <Route path="/projetos/:id" element={<WorkspaceProjetoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const reanalisar = () => {
  const mais = (h.chrome as Chrome).acoes!.find((a) => a.texto === 'Mais')!;
  return mais.menu!.find((i) => 'label' in i && i.label === 'Reanalisar') as { disabled?: boolean };
};

const OFERTA = 'Analisar com a IA';
const VAZIA = 'Esta live ainda não tem cortes';

describe('WorkspaceProjetoPage · só oferece análise com a lista de cortes carregada', () => {
  it('primeira carga (sem dado, sem erro): diz que carrega, não oferece análise e segura o Reanalisar', () => {
    const html = renderizar();
    expect(html).toContain('Carregando os cortes');
    expect(html).not.toContain(OFERTA);
    expect(html).not.toContain(VAZIA);
    expect(reanalisar().disabled).toBe(true);
  });

  it('falha da API: mostra a falha com "Tentar de novo", sem oferta de análise', () => {
    h.fase = 'erro';
    const html = renderizar();
    expect(html).toContain('Não consegui carregar os cortes desta live');
    expect(html).toContain('Tentar de novo');
    expect(html).not.toContain(OFERTA);
    expect(html).not.toContain(VAZIA);
    expect(reanalisar().disabled).toBe(true);
  });

  it('logo após "Tentar de novo" (volta a pending sem erro): não vira "ainda não tem cortes"', () => {
    h.fase = 'erro';
    expect(renderizar()).toContain('Tentar de novo');
    // O que o refetch do TanStack faz numa consulta sem dado: derruba o erro e
    // volta a `pending` (o mock reproduz isso em `refetch`).
    h.fase = 'pendente';
    const html = renderizar();
    expect(html).not.toContain(VAZIA);
    expect(html).not.toContain(OFERTA);
    expect(html).toContain('Carregando os cortes');
    expect(reanalisar().disabled).toBe(true);
  });

  it('lista carregada e vazia: aí sim "ainda não tem cortes", com a análise e o Reanalisar', () => {
    h.fase = 'ok';
    const html = renderizar();
    expect(html).toContain(VAZIA);
    expect(html).toContain(OFERTA);
    expect(html).not.toContain('Carregando os cortes');
    expect(reanalisar().disabled).toBeFalsy();
  });

  it('lista carregada com cortes: sem estado de espera, falha nem lista vazia', () => {
    h.fase = 'ok';
    h.cortes = [{ id: 'a', numero: 1, status: 'aprovado', titulo_proposto: 'a', is_fire: false } as unknown as Corte];
    const html = renderizar();
    expect(html).not.toContain('Carregando os cortes');
    expect(html).not.toContain(VAZIA);
    expect(reanalisar().disabled).toBeFalsy();
  });
});
