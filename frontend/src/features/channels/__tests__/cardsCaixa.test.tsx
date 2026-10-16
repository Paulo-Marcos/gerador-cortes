import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { caixaEsticada, componenteDoGrupo, edicaoDoRascunho } from '@/features/editor/fase2/ComponentesArrastaveis';
import { estiloDasCenasDe, COMPONENTES_PADRAO } from '@/shared/palco/palcoLimpo';
import { AjustesDosCards, CAIXA_INICIAL, SEM_CAIXA, type CardsEditaveis } from '../CardsDoCanal';
import { edicaoDe, type RascunhoDoPalco } from '../PalcoComponentesSection';

// D-941: o card do vídeo cheio com caixa — largura e altura separadas.

const cards = (zona_no_cheio?: CardsEditaveis['zona_no_cheio']): CardsEditaveis => ({
  ocultos: [],
  escala: 1,
  posicao: { automatica: true, x: 96, y: 112 },
  ajuste: 'preencher',
  alinhamento_vertical: 'centro',
  alinhamento_horizontal: 'centro',
  zona_no_cheio,
});

function rascunho(c: CardsEditaveis): RascunhoDoPalco {
  return {
    estilo: 'limpo',
    fundo: 'reticula-aurora',
    contornoShort: 32,
    fundoShort: 'palco',
    estiloDaLegenda: 'contorno',
    cards: c,
    cabecalhoAtivo: true,
    mostrarImagem: true,
    mostrarNome: true,
    mostrarHandle: true,
    nome: '',
    handle: '',
    cabecalhoEscala: 1,
    cabecalhoPosicao: { automatica: false, x: 64, y: 64 },
    cabecalhoPosicaoShort: { automatica: true, x: 0, y: 0 },
    placaAtiva: true,
    placaEscala: 1,
    placaPosicao: { automatica: true, x: 0, y: 0 },
  };
}

describe('caixa do card no vídeo cheio (D-941)', () => {
  it('o grupo Cards seleciona o card — era o que escondia a alça de tamanho', () => {
    expect(componenteDoGrupo('cards')).toBe('cards');
    expect(componenteDoGrupo('cabecalho')).toBe('cabecalho');
    expect(componenteDoGrupo('telas')).toBeNull();
  });

  it('a alça estica largura e altura separadas, presas ao quadro e ao mínimo', () => {
    const caixa = { x: 96, y: 300, w: 520, h: 480 };
    expect(caixaEsticada(caixa, 300, -20, 80)).toEqual({ x: 96, y: 300, w: 820, h: 460 });
    expect(caixaEsticada(caixa, 5000, -5000, 80)).toEqual({ x: 96, y: 300, w: 1824, h: 80 });
  });

  it('esticar cria a caixa e mover passa a levar a caixa, não a posição', () => {
    let atual: RascunhoDoPalco | null = rascunho(cards());
    const mudar = vi.fn((f: (r: RascunhoDoPalco | null) => RascunhoDoPalco | null) => {
      atual = f(atual);
    });
    const edicao = () => edicaoDoRascunho(atual!, mudar as never, 'cards', vi.fn());
    edicao().esticar?.('cards', { x: 96, y: 300, w: 900, h: 400 });
    expect(atual!.cards.zona_no_cheio).toEqual({ x: 96, y: 300, w: 900, h: 400 });
    edicao().mover('cards', 200, 150);
    expect(atual!.cards.zona_no_cheio).toEqual({ x: 200, y: 150, w: 900, h: 400 });
    expect(atual!.cards.posicao).toEqual({ automatica: true, x: 96, y: 112 });
    expect(edicao().caixa?.('cards')).toEqual({ x: 200, y: 150, w: 900, h: 400 });
  });

  it('sem caixa, o painel oferece ligá-la; com caixa, mostra largura e altura', () => {
    const sem = renderToStaticMarkup(<AjustesDosCards valor={cards()} onMudar={vi.fn()} />);
    const com = renderToStaticMarkup(<AjustesDosCards valor={cards(CAIXA_INICIAL)} onMudar={vi.fn()} />);
    expect(sem).toContain('Usar caixa (largura e altura)');
    expect(sem).not.toContain('palco-cards-caixa-w');
    expect(com).toContain('palco-cards-caixa-w');
    expect(com).toContain('palco-cards-caixa-h');
    expect(com).toContain('Sem caixa (posição e tamanho)');
  });

  it('"sem caixa" pedido manda a caixa vazia; sem caixa e sem pedido, nada muda', () => {
    expect(edicaoDe(rascunho(cards(null))).cards?.zona_no_cheio).toEqual(SEM_CAIXA);
    expect(edicaoDe(rascunho(cards())).cards?.zona_no_cheio).toBeUndefined();
    expect(edicaoDe(rascunho(cards(CAIXA_INICIAL))).cards?.zona_no_cheio).toEqual(CAIXA_INICIAL);
  });

  it('a caixa chega ao renderer no estilo limpo', () => {
    const componentes = { ...COMPONENTES_PADRAO, estilo: 'limpo' as const, cards: { ...COMPONENTES_PADRAO.cards, zona_no_cheio: CAIXA_INICIAL } };
    expect(estiloDasCenasDe(componentes)).toMatchObject({ zona_no_cheio: CAIXA_INICIAL });
  });
});
