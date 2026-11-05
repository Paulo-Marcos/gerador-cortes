import type { ReactElement, RefObject } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoletimTecnico } from '../boletimTecnico';

// D-1044: o caminho do clique no boletim até o player, e não só o cartão. O painel leva
// o vídeo ao segundo certo e, com um short escolhido, não leva: o instante do short não
// é o do vídeo horizontal. Que a tela entrega o vídeo dela está no teste da Revisão.

const h = vi.hoisted(() => ({
  escolhido: null as string | null,
  shorts: [] as { id: string; numero: number; status: string }[],
}));

vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: (inicial: unknown) => {
      const [valor, trocar] = react.useState(inicial);
      const doBoletim = typeof inicial === 'string' && inicial.startsWith('corte:');
      return [doBoletim && h.escolhido ? h.escolhido : valor, trocar];
    },
  };
});

const BOLETIM = {
  estado: 'pronto',
  paradas: [{ inicio_seg: 75, duracao_seg: 1.5, origem: 'live' }],
  emendas: { total: 0, com_som_dos_dois_lados: 0, acima_do_p99: 0, p99_da_fala: 1, itens: [] },
} as unknown as BoletimTecnico;

vi.mock('@/features/shorts/useShortsDoCorte', () => ({
  useShortsDoCorte: () => ({ data: { shorts: h.shorts } }),
}));
vi.mock('../useBoletimTecnico', () => ({
  useBoletimTecnico: () => ({ data: BOLETIM, isError: false }),
  useRemedirBoletim: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { BoletimTecnicoCard, BoletimTecnicoPainel } = await import('../BoletimTecnicoCard');
type PropsDoCartao = Parameters<typeof BoletimTecnicoCard>[0];

/** As props que o painel passa ao cartão. */
function cartaoDoPainel(player?: RefObject<HTMLVideoElement | null>): PropsDoCartao {
  let props: PropsDoCartao | undefined;
  const Sonda = () => {
    const elemento = BoletimTecnicoPainel({ corteId: 'c1', player }) as ReactElement<PropsDoCartao>;
    expect(elemento.type).toBe(BoletimTecnicoCard);
    props = elemento.props;
    return null;
  };
  renderToStaticMarkup(<Sonda />);
  return props!;
}

const video = () => ({ current: { currentTime: 0 } as HTMLVideoElement });

beforeEach(() => {
  h.escolhido = null;
  h.shorts = [];
});

describe('D-1044 · do boletim ao player', () => {
  it('no horizontal, leva o vídeo ao segundo certo', () => {
    const player = video();
    cartaoDoPainel(player).onIrPara!(75);
    expect(player.current.currentTime).toBe(75);
  });

  it('com o vídeo ainda fora da tela, o clique não quebra', () => {
    expect(() => cartaoDoPainel({ current: null }).onIrPara!(75)).not.toThrow();
  });

  it('com um short escolhido, não leva: o instante é de outro vídeo', () => {
    h.shorts = [{ id: 's1', numero: 1, status: 'renderizado' }];
    h.escolhido = 'short:s1';
    const { onIrPara, escolhido } = cartaoDoPainel(video());
    expect(escolhido.alvo.tipo).toBe('short');
    expect(onIrPara).toBeUndefined();
  });

  it('sem player, não há para onde levar', () => {
    expect(cartaoDoPainel().onIrPara).toBeUndefined();
  });
});
