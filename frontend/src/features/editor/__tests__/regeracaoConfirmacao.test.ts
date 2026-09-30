import { describe, expect, it } from 'vitest';
import { OPCOES_REGERAR_VAZIAS } from '../regerarBrutoPlan';
import {
  confirmacaoExcluirCorte,
  confirmacaoRegerarBruto,
  confirmacaoRegerarCenas,
  confirmacaoRegerarTrechos,
  rotulosDosOptIns,
} from '../regeracaoConfirmacao';

describe('confirmacaoRegerarTrechos', () => {
  it('nao pede confirmacao na primeira analise', () => {
    expect(confirmacaoRegerarTrechos(0)).toBeNull();
  });

  it('pede confirmacao quando ja ha trechos marcados', () => {
    const pedido = confirmacaoRegerarTrechos(3);
    expect(pedido?.detalhe).toBe('3 trechos ja marcados');
    expect(pedido?.descricao).toContain('ACRESCENTA');
  });

  it('usa singular com um unico trecho', () => {
    expect(confirmacaoRegerarTrechos(1)?.detalhe).toBe('1 trecho ja marcado');
  });

  it('nao marca como perigoso — a analise acrescenta, nao substitui', () => {
    expect(confirmacaoRegerarTrechos(3)?.tone).toBeUndefined();
  });
});

describe('confirmacaoRegerarCenas', () => {
  it('nao pede confirmacao sem cenas geradas', () => {
    expect(confirmacaoRegerarCenas(0)).toBeNull();
  });

  it('avisa que substitui tudo e marca como perigoso', () => {
    const pedido = confirmacaoRegerarCenas(12);
    expect(pedido?.tone).toBe('danger');
    expect(pedido?.detalhe).toBe('12 cenas atuais');
    expect(pedido?.descricao).toContain('SUBSTITUI');
  });
});

describe('confirmacaoRegerarBruto', () => {
  it('nao pede confirmacao na primeira geracao do bruto', () => {
    expect(confirmacaoRegerarBruto(false, OPCOES_REGERAR_VAZIAS)).toBeNull();
  });

  it('pede confirmacao com o bruto ja pronto', () => {
    const pedido = confirmacaoRegerarBruto(true, OPCOES_REGERAR_VAZIAS);
    expect(pedido?.tone).toBe('danger');
    expect(pedido?.descricao).not.toContain('Junto com o bruto');
  });

  it('lista os opt-ins marcados na descricao', () => {
    const pedido = confirmacaoRegerarBruto(true, {
      ...OPCOES_REGERAR_VAZIAS,
      cenas: true,
      desvios: true,
    });
    expect(pedido?.descricao).toContain('cenas, trechos a remover');
  });
});

describe('rotulosDosOptIns', () => {
  it('devolve lista vazia sem nenhum opt-in', () => {
    expect(rotulosDosOptIns(OPCOES_REGERAR_VAZIAS)).toEqual([]);
  });

  it('preserva a ordem canonica dos opt-ins', () => {
    expect(
      rotulosDosOptIns({ transcricao: true, cenas: false, metadados: true, desvios: true }),
    ).toEqual(['transcricao', 'metadados', 'trechos a remover']);
  });
});

// D-842: o R exclui (no editor e na linha do Workspace), e o que separa a tecla
// da perda de vez é este pedido — nunca pode ser `null`.
describe('confirmacaoExcluirCorte', () => {
  it('sempre pede confirmação, marcada como perigosa', () => {
    const pedido = confirmacaoExcluirCorte(7, 'O dia em que');
    expect(pedido).not.toBeNull();
    expect(pedido.tone).toBe('danger');
    expect(pedido.confirmLabel).toBe('Excluir de vez');
  });

  it('diz qual corte sai', () => {
    expect(confirmacaoExcluirCorte(7, 'O dia em que').detalhe).toBe('Corte #7 · O dia em que');
  });

  it('aponta o A para quem só queria tirar a aprovação', () => {
    const { descricao } = confirmacaoExcluirCorte(7, 'x');
    expect(descricao).toContain('Não há como desfazer');
    expect(descricao).toContain('(A)');
    expect(descricao).not.toContain('(R)');
  });
});
