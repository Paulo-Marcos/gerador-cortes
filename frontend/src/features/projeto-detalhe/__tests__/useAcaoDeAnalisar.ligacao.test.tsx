import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderIA } from '@/lib/providerIa';

// D-977, 2ª auditoria do PR #246: a ligação do hook ao modal — qual mutação
// cada botão dispara, a chave da análise com uma IA só e a liberação dos botões
// quando a análise termina.

const analisarViaClaude = vi.fn(
  (_projetoId: string, _usar: boolean, _provider: ProviderIA) => new Promise<never>(() => {}),
);
vi.mock('@/features/ia', () => ({ geracaoIaApi: { analisarViaClaude } }));

const { ToastProvider } = await import('@/components/ui/toaster');
const { analiseClaudeKey, analiseVezKey, useQuemAnalisa } = await import(
  '@/features/diarizacao/useDiarizacao'
);
const { useAcaoDeAnalisar } = await import('../useAcaoDeAnalisar');

type Acao = ReturnType<typeof useAcaoDeAnalisar>;

/** Renderiza o hook do modal e devolve o que ele expõe aos botões. */
function montarHook(qc: QueryClient): Acao {
  let acao: Acao | undefined;
  function Sonda() {
    acao = useAcaoDeAnalisar('live-a', true, () => {});
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <Sonda />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return acao!;
}

describe('useAcaoDeAnalisar ligado ao cache', () => {
  it('"As duas" dispara a análise em dupla: começa pelo Claude e marca a vez', async () => {
    analisarViaClaude.mockClear();
    const qc = new QueryClient();

    montarHook(qc).onGerarAsDuas();

    await vi.waitFor(() => expect(analisarViaClaude).toHaveBeenCalledWith('live-a', true, 'claude'));
    expect(qc.getQueryData(analiseVezKey('live-a'))).toBe('claude');
    const [mutacao] = qc.getMutationCache().getAll();
    expect(mutacao.state.variables).toEqual({ usarDiarizacao: true, asDuas: true });
  });

  it('uma IA só dispara com o provedor, sem vez, sob a chave da análise da live', async () => {
    analisarViaClaude.mockClear();
    const qc = new QueryClient();

    montarHook(qc).onGerar('gemini');

    await vi.waitFor(() => expect(analisarViaClaude).toHaveBeenCalledWith('live-a', true, 'gemini'));
    expect(qc.getQueryData(analiseVezKey('live-a'))).toBeUndefined();
    const [mutacao] = qc.getMutationCache().getAll();
    expect(mutacao.options.mutationKey).toEqual(analiseClaudeKey('live-a'));
    expect(mutacao.state.variables).toEqual({ usarDiarizacao: true, provider: 'gemini' });
  });

  it('com a dupla em voo, "As duas" aparece ocupado e gira a IA da vez', () => {
    const qc = new QueryClient();
    const pendente = qc.getMutationCache().build(qc, {
      mutationKey: analiseClaudeKey('live-a'),
      mutationFn: () => new Promise<never>(() => {}),
    });
    void pendente.execute({ usarDiarizacao: true, asDuas: true });
    qc.setQueryData(analiseVezKey('live-a'), 'gemini');

    const acao = montarHook(qc);

    expect(acao.asDuasEmVoo).toBe(true);
    expect(acao.emVoo).toBe('gemini');
  });
});

describe('useQuemAnalisa ao terminar a análise', () => {
  function quem(qc: QueryClient) {
    let lido: ReturnType<typeof useQuemAnalisa> | undefined;
    function Sonda() {
      lido = useQuemAnalisa('live-a');
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
    );
    return lido!;
  }

  it('análise concluída ainda no cache: nenhum botão gira, os três liberam', async () => {
    const qc = new QueryClient();
    const concluida = qc.getMutationCache().build(qc, {
      mutationKey: analiseClaudeKey('live-a'),
      mutationFn: async () => ({ total_cortes: 3 }),
    });
    await concluida.execute({ usarDiarizacao: true, provider: 'gemini' });

    expect(quem(qc)).toEqual({ provider: null, asDuas: false });
  });
});
