import { describe, expect, it } from 'vitest';
import { SEM_BACKEND } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';
import { mensagemErro } from '../mensagemErro';

describe('D-1204 · a falha de rede em português', () => {
  it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
    '%s vira a frase do app',
    (cru) => expect(mensagemErro(new TypeError(cru), 'padrão')).toBe(SEM_BACKEND),
  );

  it('outro erro continua com a mensagem dele (inclusive um TypeError de código)', () => {
    expect(mensagemErro(new Error('Erro interno do servidor'), 'padrão')).toBe('Erro interno do servidor');
    expect(mensagemErro(new TypeError('x is not a function'), 'padrão')).toBe('x is not a function');
    expect(mensagemErro('nada', 'padrão')).toBe('padrão');
  });
});
