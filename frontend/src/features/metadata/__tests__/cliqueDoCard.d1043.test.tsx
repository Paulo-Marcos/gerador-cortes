import { beforeEach, describe, expect, it, vi } from 'vitest';

// D-1043: o fio entre o botão de IA do card e a rota. É esta ligação que decide entre
// preencher e reescrever: trocar a chamada faz o "Completar" apagar o título escrito à
// mão com todos os outros testes verdes. Sem DOM: o hook roda como função, `useMutation`
// devolve as próprias opções, e o teste faz o que a mutação faria num clique.

const h = vi.hoisted(() => ({
  gerar: vi.fn(async () => ({})),
  regerar: vi.fn(async () => ({})),
  meta: undefined as unknown,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (inicial: unknown) => [typeof inicial === 'function' ? (inicial as () => unknown)() : inicial, vi.fn()],
  useEffect: () => undefined,
  useMemo: (calcular: () => unknown) => calcular(),
  useRef: (inicial: unknown) => ({ current: inicial }),
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (opcoes: unknown) => opcoes,
  useQuery: () => ({ data: h.meta, dataUpdatedAt: 0 }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/ia', () => ({
  geracaoIaApi: { gerarMetadadosClaude: h.gerar, regerarMetadadosClaude: h.regerar },
  useUltimaGeracao: () => ({ data: null }),
}));

// Sem React por baixo (ver o mock acima): aqui o hook é uma função comum.
const { useMetadataCard: montarCard } = await import('../useMetadataCard');

type Card = {
  generateMetadataClaude: {
    onMutate: () => void;
    mutationFn: (provider: 'claude' | 'gemini') => Promise<unknown>;
    onSuccess: () => void;
  };
  setDesfazerIa: ReturnType<typeof vi.fn>;
  rotuloIa: string;
};

async function clicarNoBotaoDeIa(meta: unknown, provider: 'claude' | 'gemini'): Promise<Card> {
  h.meta = meta;
  const card = montarCard({
    projetoId: 'p1',
    cut: { id: 'c1' } as never,
    variant: 'modal',
  }) as unknown as Card;
  card.generateMetadataClaude.onMutate();
  await card.generateMetadataClaude.mutationFn(provider);
  card.generateMetadataClaude.onSuccess();
  return card;
}

beforeEach(() => {
  h.gerar.mockClear();
  h.regerar.mockClear();
});

describe('o clique no botão de IA do card', () => {
  it('Regerar substitui e guarda a versão anterior para o Desfazer', async () => {
    const meta = { titulo_youtube: 'Meu título', descricao_youtube: 'Minha descrição', texto_capa: 'CAPA', tags_youtube: ['tag'] };

    const card = await clicarNoBotaoDeIa(meta, 'gemini');

    expect(card.rotuloIa).toBe('Regerar metadados');
    expect(h.regerar).toHaveBeenCalledWith('c1', 'gemini');
    expect(h.gerar).not.toHaveBeenCalled();
    expect(card.setDesfazerIa).toHaveBeenCalledWith(meta);
  });

  it('Completar não substitui e não oferece Desfazer', async () => {
    const meta = { titulo_youtube: 'Meu título', descricao_youtube: '', texto_capa: '', tags_youtube: [] };

    const card = await clicarNoBotaoDeIa(meta, 'claude');

    expect(card.rotuloIa).toBe('Completar metadados');
    expect(h.gerar).toHaveBeenCalledWith('c1', 'claude');
    expect(h.regerar).not.toHaveBeenCalled();
    expect(card.setDesfazerIa).toHaveBeenCalledWith(null);
  });

  it('só com descrição também completa', async () => {
    const meta = { titulo_youtube: '', descricao_youtube: 'Minha descrição', texto_capa: '', tags_youtube: [] };

    const card = await clicarNoBotaoDeIa(meta, 'claude');

    expect(card.rotuloIa).toBe('Completar metadados');
    expect(h.gerar).toHaveBeenCalledWith('c1', 'claude');
    expect(h.regerar).not.toHaveBeenCalled();
  });
});
