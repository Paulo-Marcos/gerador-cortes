import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BoletimTecnicoCard } from '../BoletimTecnicoCard';
import type { BoletimTecnico } from '../boletimTecnico';

// D-1044: o boletim era o fim da linha. O aviso de parada ou de emenda dizia o tempo e
// não levava a ele; agora leva o player da Revisão ao instante.

vi.mock('@/features/shorts/useShortsDoCorte', () => ({ useShortsDoCorte: () => ({ data: undefined }) }));

const BOLETIM = {
  estado: 'pronto',
  paradas: [{ inicio_seg: 75, duracao_seg: 1.5, origem: 'live' }],
  emendas: {
    total: 2,
    com_som_dos_dois_lados: 0,
    acima_do_p99: 1,
    p99_da_fala: 1,
    itens: [
      { tempo_seg: 30, acima_do_p99: true, com_som_dos_dois_lados: false },
      { tempo_seg: 60, acima_do_p99: false, com_som_dos_dois_lados: false },
    ],
  },
} as unknown as BoletimTecnico;

const OPCAO = { alvo: { tipo: 'corte' as const, id: 'c1' }, rotulo: 'Horizontal' };

function desenhar(onIrPara?: (s: number) => void) {
  return renderToStaticMarkup(
    <BoletimTecnicoCard
      boletim={BOLETIM}
      opcoes={[OPCAO]}
      escolhido={OPCAO}
      onEscolher={vi.fn()}
      onRemedir={vi.fn()}
      onIrPara={onIrPara}
    />,
  );
}

type No = ReactElement<{ children?: ReactNode; onClick?: () => void; title?: string }>;
function elementos(raiz: unknown): No[] {
  if (Array.isArray(raiz)) return raiz.flatMap(elementos);
  if (!raiz || typeof raiz !== 'object' || !('props' in raiz)) return [];
  const no = raiz as No;
  const filhos = typeof no.type === 'function' ? (no.type as (p: unknown) => unknown)(no.props) : no.props.children;
  return [no, ...elementos(filhos)];
}

describe('D-1044 · o boletim leva ao instante', () => {
  it('parada e emenda fora do normal viram links para o tempo delas', () => {
    const html = desenhar(vi.fn());
    expect(html).toContain('title="Ir para 1:15 no vídeo"');
    expect(html).toContain('title="Ir para 0:30 no vídeo"');
  });

  it('o clique leva ao segundo certo', () => {
    const onIrPara = vi.fn();
    const links = elementos(
      BoletimTecnicoCard({
        boletim: BOLETIM,
        opcoes: [OPCAO],
        escolhido: OPCAO,
        onEscolher: vi.fn(),
        onRemedir: vi.fn(),
        onIrPara,
      }),
    ).filter((e) => e.type === 'button' && String(e.props.title).startsWith('Ir para'));
    links.forEach((l) => l.props.onClick!());
    expect(onIrPara.mock.calls.map(([s]) => s)).toEqual([75, 30]);
  });

  it('emenda dentro do normal não vira aviso', () => {
    expect(desenhar(vi.fn())).not.toContain('Ir para 1:00 no vídeo');
  });

  it('sem player para levar, como num short, o texto continua e não há link', () => {
    const html = desenhar();
    expect(html).toContain('1:15');
    expect(html).not.toContain('Ir para');
  });
});
