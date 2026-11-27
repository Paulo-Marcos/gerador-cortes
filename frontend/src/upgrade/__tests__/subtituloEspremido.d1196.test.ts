// D-1196: com o painel atrás, o subtítulo espremido da linha do topo ("10…") virava um
// selo que parecia contador. Ilegível é aperto: cede o degrau 1 (o subtítulo sai).
import { describe, expect, it } from 'vitest';
import { proximoAperto, SEM_APERTO, SUBTITULO_MIN_PX, subtituloEspremido } from '../apertoDaBarra';

describe('D-1196 · o subtítulo ilegível sai da linha do topo', () => {
  it('espremido é cortado E mais estreito que o mínimo', () => {
    expect(subtituloEspremido({ clientWidth: 34, scrollWidth: 300 })).toBe(true);
    expect(subtituloEspremido({ clientWidth: SUBTITULO_MIN_PX, scrollWidth: 300 })).toBe(false);
    // curto mas inteiro: cabe, fica
    expect(subtituloEspremido({ clientWidth: 60, scrollWidth: 60 })).toBe(false);
    expect(subtituloEspremido(null)).toBe(false);
  });

  it('cede o degrau 1 mesmo com a trilha larga', () => {
    const medida = { largura: 1300, folga: 0, trilha: 760, transbordo: 0 };
    expect(proximoAperto(SEM_APERTO, medida)).toEqual(SEM_APERTO);
    expect(proximoAperto(SEM_APERTO, { ...medida, subtituloEspremido: true })).toEqual({ nivel: 1, cedeuEm: [1300] });
  });
});
