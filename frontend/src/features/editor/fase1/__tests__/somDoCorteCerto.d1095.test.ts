import { beforeEach, describe, expect, it, vi } from 'vitest';

// D-1095, decisão do Paulo (10/11/2026, opção A): "Está certo" marca a pergunta
// do som e desliga o fone; não grava nada; qualquer passo novo, ou outro corte,
// desmarca. Sem DOM nos testes, o useState vira uma fila: cada estado do hook
// tem a posição em que é declarado.
const h = vi.hoisted(() => ({
  valores: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: <F>(fn: F) => fn,
  useState: (inicial: unknown) => {
    const i = h.setters.length;
    const setter = vi.fn();
    h.setters.push(setter);
    return [i in h.valores ? h.valores[i] : inicial, setter];
  },
}));

const { useSomDoCorte } = await import('../useSomDoCorte');

// A ordem dos useState no hook.
const QUER_OUVIR = 0;
const CERTO = 2;
const VISTO = 3;

/** Chama o hook com os estados dados (um `use…` para a regra dos hooks aceitar a chamada). */
function useComEstados(
  estados: Record<number, unknown>,
  props: { corteId?: string; audioOffsetMs?: number; onAudioOffsetChange?: (ms: number) => void } = {},
) {
  h.setters = [];
  h.valores = [];
  for (const [i, v] of Object.entries(estados)) h.valores[Number(i)] = v;
  return useSomDoCorte({ corteId: 'c1', audioOffsetMs: 40, audioPreviewSrc: '/a.flac', onAudioOffsetChange: vi.fn(), ...props });
}

describe('useSomDoCorte: o "Está certo"', () => {
  beforeEach(() => {
    h.setters = [];
  });

  it('começa não respondido', () => {
    expect(useComEstados({}).som.certo).toBe(false);
  });

  it('marcar responde a pergunta e desliga o fone (o vídeo volta a ter som)', () => {
    const { som } = useComEstados({ [QUER_OUVIR]: true, [VISTO]: { corteId: 'c1', audioOffsetMs: 40 } });
    expect(som.ouvindo).toBe(true);
    som.marcarCerto();
    expect(h.setters[CERTO]).toHaveBeenCalledWith(true);
    expect(h.setters[QUER_OUVIR]).toHaveBeenCalledWith(false);
  });

  it('respondido e com o mesmo som, continua marcado', () => {
    const { som } = useComEstados({ [CERTO]: true, [VISTO]: { corteId: 'c1', audioOffsetMs: 40 } });
    expect(som.certo).toBe(true);
    expect(h.setters[CERTO]).not.toHaveBeenCalled();
  });

  it('um passo novo (botão, Ctrl+, ou Ctrl+.) desmarca', () => {
    useComEstados({ [CERTO]: true, [VISTO]: { corteId: 'c1', audioOffsetMs: 40 } }, { audioOffsetMs: 50 });
    expect(h.setters[CERTO]).toHaveBeenCalledWith(false);
    expect(h.setters[VISTO]).toHaveBeenCalledWith({ corteId: 'c1', audioOffsetMs: 50 });
  });

  it('outro corte desmarca: a marca vale só nesta visita', () => {
    useComEstados({ [CERTO]: true, [VISTO]: { corteId: 'c1', audioOffsetMs: 40 } }, { corteId: 'c2' });
    expect(h.setters[CERTO]).toHaveBeenCalledWith(false);
  });

  it('não grava nada: marcar não chama a mudança do offset', () => {
    const mudar = vi.fn();
    const { som } = useComEstados({}, { onAudioOffsetChange: mudar });
    som.marcarCerto();
    expect(mudar).not.toHaveBeenCalled();
  });
});
