// Catraca de design `umPrimarioPorTela` (D-1115, E-069 H-06; DIRECAO §5, §8.2 e §9.4).
//
// Diferente das outras, ela não varre arquivo: conta botão no HTML que a tela
// renderiza. Por isso cada história de tela chama `esperarPrimarios` no teste
// de render da própria tela (as telas de hoje ainda não emitem `data-variant`).
// Aqui ficam travados o contador e o esperado de cada tela, que é o desenho.

import { contarPrimarios, esperarPrimarios, PRIMARIOS_POR_TELA } from './primariosDaTela';

describe('catraca de design: umPrimarioPorTela', () => {
  it('a §5 manda: um primário nas telas de ação e nenhum nas de escolha e leitura', () => {
    expect(PRIMARIOS_POR_TELA).toEqual({
      Biblioteca: 1,
      BibliotecaVazia: 1,
      CortesDaLive: 1,
      Metadados: 1,
      Revisao: 1,
      Editor: 1,
      Pos: 1,
      Shorts: 0,
      Configuracoes: 0,
      Analises: 0,
      Fila: 0,
    });
  });

  it('o contador conta só `data-variant="primario"`', () => {
    const tela = `
      <button data-variant="primario">Publicar 6 cortes</button>
      <button data-variant="secondary">Editar</button>
      <button data-variant="ghost">Voltar</button>
    `;
    expect(contarPrimarios(tela)).toBe(1);
    expect(contarPrimarios('<button>Sem variante</button>')).toBe(0);
  });

  it('reprova a tela com dois primários e a de escolha com um', () => {
    const doisPrimarios = '<button data-variant="primario">A</button><button data-variant="primario">B</button>';
    expect(() => esperarPrimarios(doisPrimarios, 'Editor')).toThrow();
    expect(() => esperarPrimarios('<button data-variant="primario">A</button>', 'Fila')).toThrow();
    expect(() => esperarPrimarios('<button data-variant="primario">A</button>', 'Editor')).not.toThrow();
    expect(() => esperarPrimarios('<button>A</button>', 'Fila')).not.toThrow();
  });
});
