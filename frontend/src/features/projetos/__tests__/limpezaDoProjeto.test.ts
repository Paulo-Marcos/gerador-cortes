import { describe, expect, it } from 'vitest';
import { limpezaDoProjeto } from '../limpezaDoProjeto';

const projeto = (over: Partial<Parameters<typeof limpezaDoProjeto>[0]> = {}) => ({
  arquivos_limpos: false,
  fires_pendentes: 0,
  status: 'analisado' as const,
  ...over,
});

describe('limpezaDoProjeto', () => {
  it('diz que esta pronto quando nenhum Fire aguarda shorts', () => {
    expect(limpezaDoProjeto(projeto())?.chave).toBe('pronto');
  });

  it('avisa quantos Fires a limpeza vai guardar', () => {
    const estado = limpezaDoProjeto(projeto({ fires_pendentes: 2 }));
    expect(estado?.chave).toBe('guardando');
    expect(estado?.texto).toBe('2 fire pendentes');
  });

  it('marca a live ja limpa, mesmo com Fire pendente', () => {
    expect(limpezaDoProjeto(projeto({ arquivos_limpos: true, fires_pendentes: 1 }))?.chave).toBe(
      'limpo',
    );
  });

  it('nao da selo enquanto o video ainda esta baixando', () => {
    expect(limpezaDoProjeto(projeto({ status: 'baixando' }))).toBeNull();
  });
});
