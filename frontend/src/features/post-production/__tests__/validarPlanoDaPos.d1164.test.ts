import { describe, expect, it } from 'vitest';
import { decidirValidacao } from '../useValidarPlanoDaPos';

// D-1164 (auditoria): o primário "Validar plano" só valida o que está na tela. Sem estas guardas o
// operador validaria o plano salvo enquanto vê outro, ou mandaria duas validações.
const livre = { emGeracao: false, cenasNaoSalvas: false, validando: false };

describe('D-1164 · o clique em "Validar plano"', () => {
  it('livre: valida', () => {
    expect(decidirValidacao(livre)).toBe('validar');
  });

  it('com as cenas em geração, espera: elas ainda vão ser substituídas', () => {
    expect(decidirValidacao({ ...livre, emGeracao: true })).toBe('esperar-geracao');
  });

  it('com edição não salva, pede para salvar antes', () => {
    expect(decidirValidacao({ ...livre, cenasNaoSalvas: true })).toBe('salvar-antes');
  });

  it('com uma validação em voo, não manda outra', () => {
    expect(decidirValidacao({ ...livre, validando: true })).toBe('ja-validando');
  });

  it('a geração vem antes da edição não salva (a mensagem certa)', () => {
    expect(decidirValidacao({ emGeracao: true, cenasNaoSalvas: true, validando: true })).toBe('esperar-geracao');
  });
});
