import { describe, expect, it } from 'vitest';
import { acaoDaTecla, type Contexto } from '../teclasDaCasca';

// Estado neutro: nada focado, nada aberto, primario disponivel.
const base: Contexto = {
  tecla: '',
  meta: false,
  ctrl: false,
  alt: false,
  digitando: false,
  focoEmControle: false,
  overlayAberto: false,
  jaTratado: false,
  primarioDisponivel: true,
};

const com = (parcial: Partial<Contexto>): Contexto => ({ ...base, ...parcial });

describe('acaoDaTecla', () => {
  it('J e K trocam de corte quando nada disputa o teclado', () => {
    expect(acaoDaTecla(com({ tecla: 'j' }))).toBe('proximo');
    expect(acaoDaTecla(com({ tecla: 'k' }))).toBe('anterior');
    expect(acaoDaTecla(com({ tecla: 'J' }))).toBe('proximo');
  });

  it('J digitado num campo de titulo e letra, nao troca de corte', () => {
    expect(acaoDaTecla(com({ tecla: 'j', digitando: true }))).toBeNull();
  });

  it('com dialogo aberto J/K e Enter sao do dialogo', () => {
    expect(acaoDaTecla(com({ tecla: 'j', overlayAberto: true }))).toBeNull();
    expect(acaoDaTecla(com({ tecla: 'Enter', overlayAberto: true }))).toBeNull();
  });

  it('Enter dispara o primario quando o foco nao esta num controle', () => {
    expect(acaoDaTecla(com({ tecla: 'Enter' }))).toBe('primario');
  });

  it('Enter com foco num botao NAO dispara o primario — seria acao dupla', () => {
    // Foco em "Rejeitar": o navegador ja clica nele. Aprovar junto seria o bug.
    expect(acaoDaTecla(com({ tecla: 'Enter', focoEmControle: true }))).toBeNull();
  });

  it('Enter com primario desabilitado nao faz nada', () => {
    expect(acaoDaTecla(com({ tecla: 'Enter', primarioDisponivel: false }))).toBeNull();
  });

  it('Enter ja tratado por outro handler nao dispara de novo', () => {
    expect(acaoDaTecla(com({ tecla: 'Enter', jaTratado: true }))).toBeNull();
  });

  it('⌘B e ⌘K funcionam ate digitando: o modificador diz que nao e texto', () => {
    expect(acaoDaTecla(com({ tecla: 'b', meta: true, digitando: true }))).toBe('trilho');
    expect(acaoDaTecla(com({ tecla: 'k', ctrl: true, digitando: true }))).toBe('busca');
  });

  it('K com Ctrl e busca, nao corte anterior', () => {
    expect(acaoDaTecla(com({ tecla: 'k', ctrl: true }))).toBe('busca');
  });

  it('tecla sem significado para a casca devolve null', () => {
    expect(acaoDaTecla(com({ tecla: 'x' }))).toBeNull();
    expect(acaoDaTecla(com({ tecla: 'j', alt: true }))).toBeNull();
  });
});
