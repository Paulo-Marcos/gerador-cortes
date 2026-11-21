import { contarPrimarios, contarPrimariosAcesos, esperarPrimarios } from './primariosDaTela';

// D-1165 · Controles da régua `esperarPrimarios`: o que ela NÃO pode contar nem confundir.

describe('a régua lê o atributo `disabled`, não a palavra', () => {
  const comTitle = '<button data-variant="primario" title="fica disabled até aprovar">Publicar</button>';

  it('"disabled" dentro de um valor de atributo não apaga o primário', () => {
    expect(contarPrimariosAcesos(comTitle)).toBe(1);
    expect(() => esperarPrimarios(comTitle, 'Editor')).not.toThrow();
  });

  it('o `disabled` de verdade, com ou sem valor, apaga o primário', () => {
    expect(contarPrimariosAcesos('<button data-variant="primario" disabled="">A</button>')).toBe(0);
    expect(contarPrimariosAcesos('<button data-variant="primario" title="x" disabled>A</button>')).toBe(0);
    expect(() => esperarPrimarios('<button data-variant="primario" disabled="">A</button>', 'Editor')).toThrow();
  });
});

describe('a régua só conta a variante que o Button novo emite', () => {
  it('o legado (`default`) e o nome morto (`primary`) não são primário', () => {
    expect(contarPrimarios('<button data-variant="default">A</button>')).toBe(0);
    expect(contarPrimarios('<button data-variant="primary">A</button>')).toBe(0);
    expect(contarPrimarios('<button data-variant="primario">A</button>')).toBe(1);
  });
});
