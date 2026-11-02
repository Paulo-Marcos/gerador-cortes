import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// D-1008: apertar o atalho do bruto parecia não fazer nada. O único aviso só
// saía quando a API respondia; com o bruto já em andamento o atalho se calava;
// e o selo do player seguia dizendo "pronto" durante a regeração.

const notify = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify }) }));
vi.mock('@/features/shorts/legendasDoCorte', () => ({ atualizarLegendasDoCorte: vi.fn() }));
vi.mock('../api/bruto', () => ({
  // Nunca responde: o aviso tem de sair antes da resposta.
  brutoApi: { cortarClipBruto: vi.fn(() => new Promise(() => {})) },
}));

const { avisarSeBrutoOcupado, seloDoPlayer, useGerarBruto } = await import('../useBruto');

function sondarGerarBruto() {
  let exposto: ReturnType<typeof useGerarBruto> | undefined;
  function Sonda() {
    exposto = useGerarBruto('c1', 'p1');
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Sonda />
    </QueryClientProvider>,
  );
  return exposto!;
}

beforeEach(() => notify.mockClear());

describe('D-1008 · o gesto de gerar o bruto dá retorno', () => {
  it('avisa que está processando sem esperar a resposta da API', async () => {
    sondarGerarBruto().mutate(undefined);
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Processando o bruto do corte…', { tone: 'info' }),
    );
  });

  it('com o bruto já em andamento, diz isso em vez de se calar', () => {
    expect(avisarSeBrutoOcupado(true, notify)).toBe(true);
    expect(notify).toHaveBeenCalledWith('O bruto deste corte já está sendo processado.', {
      tone: 'info',
    });
  });

  it('livre, segue em silêncio para a geração avisar', () => {
    expect(avisarSeBrutoOcupado(false, notify)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('D-1008 · o selo do player acompanha a geração', () => {
  it.each(['cortando', 'processando'])('com o status "%s", mostra que está processando', (status) => {
    // O aviso some em segundos; a geração leva minutos. Vale também na
    // regeração, em que o bruto antigo ainda existe.
    expect(seloDoPlayer(true, status)).toBe('BRUTO · processando…');
    expect(seloDoPlayer(false, status)).toBe('BRUTO · processando…');
  });

  it('fora da geração, mantém os selos de sempre', () => {
    expect(seloDoPlayer(true, 'pronto')).toBe('BRUTO · pronto');
    expect(seloDoPlayer(false, undefined)).toBe('VÍDEO ORIGINAL');
  });
});
