import { describe, expect, it } from 'vitest';
import { montarPayloadAvaliacao, rotuloVeredito } from '../thumbnailAvaliacao';

describe('rotuloVeredito', () => {
  it('traduz os vereditos conhecidos', () => {
    expect(rotuloVeredito('otimo')).toBe('Ótimo');
    expect(rotuloVeredito('ruim')).toBe('Ruim');
  });
});

describe('montarPayloadAvaliacao', () => {
  it('caminho rápido: só o veredito, critérios nulos', () => {
    const payload = montarPayloadAvaliacao({ veredito: 'bom' });
    expect(payload).toEqual({
      veredito: 'bom',
      nota_fidelidade: null,
      nota_clareza: null,
      nota_beleza: null,
      nota_impacto: null,
      nota_honestidade: null,
      comentario: '',
    });
  });

  it('mantém notas válidas e zera as fora do intervalo', () => {
    const payload = montarPayloadAvaliacao({
      veredito: 'otimo',
      notas: { nota_beleza: 5, nota_clareza: 0, nota_impacto: 9 },
    });
    expect(payload.nota_beleza).toBe(5);
    // 0 e 9 são inválidos → viram null (critério não avaliado).
    expect(payload.nota_clareza).toBeNull();
    expect(payload.nota_impacto).toBeNull();
  });

  it('apara o comentário', () => {
    const payload = montarPayloadAvaliacao({
      veredito: 'regular',
      comentario: '  precisa de mais contraste  ',
    });
    expect(payload.comentario).toBe('precisa de mais contraste');
  });
});
