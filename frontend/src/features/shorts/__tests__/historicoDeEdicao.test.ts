import { describe, expect, it } from 'vitest';
import {
  desfazer,
  ehReversivel,
  empilhar,
  HISTORICO_VAZIO,
  refazer,
  rotuloDaMudanca,
  valoresAnteriores,
  type PassoDaEdicao,
} from '../historicoDeEdicao';

// D-581: o desfazer da curadoria, testado como regra.
//
// Aqui o histórico não guarda um rascunho (como o do Bruto) e sim o PAR de cada
// gravação: o que estava e o que ficou. É o que permite desfazer num modelo em
// que tudo já foi para o banco.

function passo(over: Partial<PassoDaEdicao> = {}): PassoDaEdicao {
  return {
    shortId: 's1',
    rotulo: 'as bordas',
    antes: { inicio_seg: 10 },
    depois: { inicio_seg: 12 },
    ...over,
  };
}

describe('empilhar', () => {
  it('guarda o passo e limpa o futuro', () => {
    const comFuturo = { passados: [], futuros: [passo()] };
    const depois = empilhar(comFuturo, passo({ rotulo: 'o gancho' }));
    expect(depois.passados).toHaveLength(1);
    // Editar depois de desfazer invalida o caminho de refazer: mantê-lo daria
    // um "refazer" que aplica algo que não faz mais sentido sobre o agora.
    expect(depois.futuros).toHaveLength(0);
  });

  it('respeita o teto de passos', () => {
    let historico = HISTORICO_VAZIO;
    for (let i = 0; i < 5; i += 1) {
      historico = empilhar(historico, passo({ rotulo: `p${i}` }), 3);
    }
    expect(historico.passados).toHaveLength(3);
    expect(historico.passados[0].rotulo).toBe('p2');
  });
});

describe('desfazer e refazer', () => {
  it('a ida e a volta devolvem o mesmo estado', () => {
    const p = passo();
    const empilhado = empilhar(HISTORICO_VAZIO, p);

    const desfeito = desfazer(empilhado);
    expect(desfeito?.passo.antes).toEqual({ inicio_seg: 10 });
    expect(desfeito?.historico.passados).toHaveLength(0);
    expect(desfeito?.historico.futuros).toHaveLength(1);

    const refeito = refazer(desfeito!.historico);
    expect(refeito?.passo.depois).toEqual({ inicio_seg: 12 });
    expect(refeito?.historico).toEqual(empilhado);
  });

  it('sem passado e sem futuro, não há passo nenhum', () => {
    expect(desfazer(HISTORICO_VAZIO)).toBeNull();
    expect(refazer(HISTORICO_VAZIO)).toBeNull();
  });
});

describe('valoresAnteriores', () => {
  it('lê só as chaves que a mudança toca', () => {
    const short = { inicio_seg: 10, fim_seg: 40, status: 'sugerido', titulo: 'T' };
    expect(valoresAnteriores(short, { inicio_seg: 12 })).toEqual({ inicio_seg: 10 });
  });

  it('descarta chave que o short não tem', () => {
    // Mandá-la como `null` ao backend pediria para apagar um campo que só
    // estava indefinido porque o backend ainda não o conhece.
    expect(valoresAnteriores({ inicio_seg: 10 }, { gancho_cor: '#facc15' })).toEqual({});
  });

  it('sem short na tela, não há o que reverter', () => {
    expect(valoresAnteriores(undefined, { status: 'aprovado' })).toEqual({});
  });
});

describe('ehReversivel', () => {
  it('passo sem "antes" não entra na pilha', () => {
    expect(ehReversivel(passo({ antes: {} }))).toBe(false);
    expect(ehReversivel(passo())).toBe(true);
  });
});

describe('rotuloDaMudanca', () => {
  it.each([
    [{ status: 'aprovado' as const }, 'a decisão'],
    [{ inicio_seg: 1 }, 'as bordas'],
    [{ gancho_cor: '#fff' }, 'o gancho'],
    [{ legenda_fonte: 'Anton' }, 'a legenda'],
    [{ foco_x: 0.5 }, 'o enquadramento'],
    [{ arranjo_palco: 'cheia' }, 'o palco'],
  ])('%o vira "%s"', (mudanca, esperado) => {
    expect(rotuloDaMudanca(mudanca)).toBe(esperado);
  });
});
