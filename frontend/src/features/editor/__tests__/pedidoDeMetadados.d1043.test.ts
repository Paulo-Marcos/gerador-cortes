import { beforeEach, describe, expect, it, vi } from 'vitest';

// D-1043: o hook do editor escolhe a rota pelo pedido. Sem DOM aqui: `useMutation`
// devolve as próprias opções, e o teste chama o `mutationFn` que a tela chamaria.

const h = vi.hoisted(() => ({
  gerar: vi.fn(async () => ({})),
  regerar: vi.fn(async () => ({})),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (opcoes: unknown) => opcoes,
  useMutationState: () => [],
  useQueryClient: () => ({}),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/ia', () => ({
  geracaoIaApi: { gerarMetadadosClaude: h.gerar, regerarMetadadosClaude: h.regerar },
}));

const { useGerarMetadadosClaude } = await import('../useGeracoesDaIa');

type Opcoes = { mutationFn: (pedido?: 'claude' | { substituir: true }) => Promise<unknown> };

beforeEach(() => {
  h.gerar.mockClear();
  h.regerar.mockClear();
});

describe('useGerarMetadadosClaude', () => {
  it('sem pedido de substituir, preenche só o que falta', async () => {
    await (useGerarMetadadosClaude('c1') as unknown as Opcoes).mutationFn('claude');

    expect(h.gerar).toHaveBeenCalledWith('c1', 'claude');
    expect(h.regerar).not.toHaveBeenCalled();
  });

  it('com o pedido de substituir, regera', async () => {
    await (useGerarMetadadosClaude('c1') as unknown as Opcoes).mutationFn({ substituir: true });

    expect(h.regerar).toHaveBeenCalledWith('c1');
    expect(h.gerar).not.toHaveBeenCalled();
  });
});
