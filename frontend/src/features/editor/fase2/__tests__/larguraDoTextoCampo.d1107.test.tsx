import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AjustesDosCards, LARGURA_MINIMA_DO_TEXTO, type CardsEditaveis } from '@/features/channels/CardsDoCanal';

// D-1107: a ligação do campo com o mínimo (a auditoria mostrou que trocar a função
// por Math.round no onMudar deixava os outros testes verdes).

const cards = (): CardsEditaveis => ({
  ocultos: [],
  escala: 1,
  posicao: { automatica: true, x: 96, y: 112 },
  ajuste: 'preencher',
  alinhamento_vertical: 'centro',
  alinhamento_horizontal: 'centro',
  largura_do_texto: 0,
});

// Sem testing-library: percorre a árvore de elementos, chamando os componentes de função.
function acharCampo(no: ReactNode, id: string): ReactElement<{ id: string; onMudar: (n: number) => void }> | null {
  if (!isValidElement(no)) return null;
  const el = no as ReactElement<{ id?: string; children?: ReactNode; onMudar?: (n: number) => void }>;
  if (el.props.id === id) return el as ReactElement<{ id: string; onMudar: (n: number) => void }>;
  // Componente com hook não roda fora do React: seus filhos não interessam aqui.
  const chamar = (): ReactNode[] => {
    if (typeof el.type !== 'function') return [el.props.children];
    try {
      return [(el.type as (p: unknown) => ReactNode)(el.props)];
    } catch {
      return [];
    }
  };
  const filhos = chamar();
  for (const f of filhos.flat()) {
    const achado = acharCampo(f, id);
    if (achado) return achado;
  }
  return null;
}

describe('o campo aplica o mínimo à vista (D-1107)', () => {
  it('digitar 100 devolve 240 ao rascunho; digitar 0 devolve automática', () => {
    const recebidos: CardsEditaveis[] = [];
    const campo = acharCampo(AjustesDosCards({ valor: cards(), onMudar: (v) => recebidos.push(v) }), 'palco-cards-largura-texto');
    expect(campo).not.toBeNull();
    campo!.props.onMudar(100);
    campo!.props.onMudar(0);
    expect(recebidos.map((c) => c.largura_do_texto)).toEqual([LARGURA_MINIMA_DO_TEXTO, 0]);
  });
});
