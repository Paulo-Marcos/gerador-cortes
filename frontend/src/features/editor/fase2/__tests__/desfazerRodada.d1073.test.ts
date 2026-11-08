import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/shared/api';
import { corteKey, cortesProjetoKey, exportStatusKey, todasAsRodadasDasCenasKey } from '@/shared/chavesDeCache';

// D-1073: o fio entre o "Desfazer rodada" e a rota. Sem DOM: o hook roda como função,
// `useMutation` devolve as próprias opções, e o teste faz o que a mutação faria num
// clique (padrão da D-1043). O que se prova: o clique manda a versão que a tela viu; só a
// resposta do servidor vira toast de sucesso; a recusa mostra a frase dele; e, dando
// certo ou não, o plano, a marca de validadas e o render travado recarregam do banco.

const h = vi.hoisted(() => ({
  rodadas: undefined as unknown,
  emGeracao: false,
  notify: vi.fn(),
  invalidar: vi.fn(),
  desfazer: vi.fn(async () => ({})),
  mutate: vi.fn(),
  opcoes: undefined as unknown,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (inicial: unknown) => [inicial, vi.fn()],
}));
vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: undefined,
  useMutation: (opcoes: object) => {
    h.opcoes = opcoes;
    return { isPending: false, mutate: h.mutate };
  },
  useQuery: () => ({ data: h.rodadas, dataUpdatedAt: Date.parse('2026-11-07T12:00:00Z'), isError: false }),
  useQueryClient: () => ({ invalidateQueries: h.invalidar }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify }) }));
vi.mock('@/features/editor/useGeracoesDaIa', () => ({ useCenasEmGeracao: () => ({ emGeracao: h.emGeracao }) }));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCorte: () => ({ dataUpdatedAt: 7 }),
}));
vi.mock('../../api/cenas', () => ({ cenasApi: { desfazerRodada: h.desfazer, compararRodadas: vi.fn() } }));

// Sem React por baixo (ver o mock acima): aqui o hook é uma função comum.
const { useRodadaDoPlano: montarRodada } = await import('../useRodadaDoPlano');

const SEM_DIFERENCA = { entraram: [], sairam: [], mudaram: [] };
const rodada = (origem: string, gerada_em: string, validadas = false) => ({
  origem,
  gerada_em,
  validadas,
  validadas_em: null,
  cenas: [{ tipo: 'enfase', texto: origem, inicio: 1, fim: 2 }],
});
const DUAS = {
  versao: 'v-que-a-tela-viu',
  atual: rodada('claude', '2026-11-07T10:00:00'),
  anterior: rodada('gemini', '2026-11-06T10:00:00', true),
  diferencas: SEM_DIFERENCA,
};

type Mutacao = {
  mutationFn: (versao: string) => Promise<unknown>;
  onSuccess: (nova: unknown) => void;
  onError: (erro: unknown) => void;
  onSettled: () => void;
};

/** O hook como a tela o monta, e as opções que ele passou ao `useMutation`. */
function montar(dirty = false) {
  const hook = montarRodada('c1', 'p1', dirty);
  return { hook, opcoes: h.opcoes as Mutacao };
}

beforeEach(() => {
  h.rodadas = DUAS;
  h.emGeracao = false;
  for (const fn of [h.notify, h.invalidar, h.desfazer, h.mutate]) fn.mockClear();
});

describe('D-1073 · o clique do Desfazer rodada', () => {
  it('manda à rota a versão que a tela mostrou', () => {
    montar().hook.desfazer();
    expect(h.mutate).toHaveBeenCalledWith('v-que-a-tela-viu');
  });

  it('não dispara sem rodada anterior, durante a geração nem com cenas sem salvar', () => {
    h.rodadas = { ...DUAS, anterior: null };
    montar().hook.desfazer();
    h.rodadas = DUAS;
    h.emGeracao = true;
    montar().hook.desfazer();
    h.emGeracao = false;
    montar(true).hook.desfazer();
    expect(h.mutate).not.toHaveBeenCalled();
  });
});

describe('D-1073 · o que a resposta do servidor faz', () => {
  const opcoesDaMutacao = async (): Promise<Mutacao> => montar().opcoes;

  it('chama a rota de desfazer com o corte e a versão', async () => {
    await (await opcoesDaMutacao()).mutationFn('v1');
    expect(h.desfazer).toHaveBeenCalledWith('c1', 'v1');
  });

  it('o sucesso diz o plano que voltou, com a frase da validação, e só com a resposta', async () => {
    const opcoes = await opcoesDaMutacao();
    expect(h.notify).not.toHaveBeenCalled();
    // Desfeita: a atual agora é a mais velha (Gemini), validada.
    opcoes.onSuccess({ ...DUAS, atual: DUAS.anterior, anterior: DUAS.atual });
    expect(h.notify).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Rodada desfeita: o plano agora é o de Gemini · há \d+ (dia|dias)\. Ele já estava validado\.$/),
      { tone: 'success' },
    );
    // Refeita: volta a do Claude, que não estava validada — o render final espera.
    opcoes.onSuccess(DUAS);
    expect(h.notify).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Rodada refeita: o plano agora é o de Claude .* Valide o plano para liberar o render final\.$/),
      { tone: 'info' },
    );
  });

  it('a recusa mostra a frase do servidor, como erro, sem sucesso nenhum', async () => {
    const frase = 'As cenas mudaram desde a comparação e a rodada não foi desfeita. Confira de novo.';
    const opcoes = await opcoesDaMutacao();
    opcoes.onError(new ErroDaApi(400, JSON.stringify({ detail: frase }), 'Bad Request'));
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith(frase, { tone: 'error' });
  });

  it('dando certo ou não, recarrega as rodadas, o corte (cenas e validadas) e o status do render', async () => {
    (await opcoesDaMutacao()).onSettled();
    const chaves = h.invalidar.mock.calls.map(([filtro]) => filtro.queryKey);
    expect(chaves).toEqual(
      expect.arrayContaining([
        todasAsRodadasDasCenasKey('c1'),
        corteKey('c1'),
        cortesProjetoKey('p1'),
        exportStatusKey('p1'),
      ]),
    );
  });
});
