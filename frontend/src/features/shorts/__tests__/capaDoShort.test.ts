import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  comSegundos,
  FRACAO_CORTADA,
  FRACAO_SEGURA,
  instanteDaPosicao,
  instanteEm,
  PASSO_SEG,
  posicaoNaRegua,
  recadoDoInstante,
} from '../capaDoShort';

const DOMINIO = resolve(__dirname, '../../../../../backend/app/domain/short/capa_short.py');

// A guia desenhada na tela É a promessa de onde a vitrine corta. Se ela
// discordar do backend, a tela mente sobre o recorte — e o sintoma aparece só
// na grade do perfil, depois de publicado.
describe('acordo com o domínio do backend', () => {
  const fonte = readFileSync(DOMINIO, 'utf-8');

  it('a fração segura é a mesma dos dois lados', () => {
    const encontrado = /^FRACAO_SEGURA\s*=\s*(\d+)\s*\/\s*(\d+)/m.exec(fonte);
    expect(encontrado, 'FRACAO_SEGURA sumiu do domínio').not.toBeNull();
    expect(Number(encontrado?.[1]) / Number(encontrado?.[2])).toBeCloseTo(FRACAO_SEGURA, 10);
  });

  it('o passo do ajuste fino é o mesmo', () => {
    const encontrado = /^PASSO_SEG\s*=\s*([\d.]+)/m.exec(fonte);
    expect(encontrado, 'PASSO_SEG sumiu do domínio').not.toBeNull();
    expect(Number(encontrado?.[1])).toBe(PASSO_SEG);
  });
});

describe('geometria da vitrine', () => {
  it('o que some em cima e embaixo soma com o que fica', () => {
    expect(FRACAO_CORTADA * 2 + FRACAO_SEGURA).toBeCloseTo(1, 10);
  });

  it('a vitrine preserva a maior parte do quadro', () => {
    expect(FRACAO_SEGURA).toBeGreaterThan(0.5);
  });
});

describe('instanteEm', () => {
  it('dentro do vídeo passa intacto', () => {
    expect(instanteEm(5, 30, 0).seg).toBe(5);
  });

  it('depois do fim encosta no fim', () => {
    expect(instanteEm(99, 30, 0).seg).toBe(30);
  });

  it('negativo encosta no começo', () => {
    expect(instanteEm(-3, 30, 0).seg).toBe(0);
  });

  it('sabe quando o quadro cai sobre o gancho', () => {
    expect(instanteEm(1.2, 30, 2.5).noGancho).toBe(true);
    expect(instanteEm(2.5, 30, 2.5).noGancho).toBe(false);
    expect(instanteEm(10, 30, 2.5).noGancho).toBe(false);
  });

  it('short sem gancho nunca está sobre ele', () => {
    expect(instanteEm(0, 30, 0).noGancho).toBe(false);
  });

  it('duração inválida não vira NaN na tela', () => {
    expect(instanteEm(5, Number.NaN, 0).seg).toBe(0);
    expect(instanteEm(5, 0, 0).seg).toBe(0);
  });
});

describe('recadoDoInstante', () => {
  it('quadro com gancho é elogiado, não avisado', () => {
    /** A melhor capa que um short tem é a que já traz a promessa escrita. */
    expect(recadoDoInstante(instanteEm(1, 30, 2.5))).toContain('gancho');
  });

  it('todo caso tem recado escrito', () => {
    expect(recadoDoInstante(instanteEm(10, 30, 2.5)).length).toBeGreaterThan(0);
  });
});

describe('régua', () => {
  it('a posição e o instante são inversos', () => {
    expect(instanteDaPosicao(posicaoNaRegua(12, 30), 30)).toBe(12);
  });

  it('a posição fica entre 0 e 1', () => {
    expect(posicaoNaRegua(-5, 30)).toBe(0);
    expect(posicaoNaRegua(99, 30)).toBe(1);
  });

  it('vídeo sem duração não quebra a régua', () => {
    expect(posicaoNaRegua(5, 0)).toBe(0);
    expect(instanteDaPosicao(0.5, 0)).toBe(0);
  });
});

describe('comSegundos', () => {
  it('mostra o décimo, que é o passo do ajuste fino', () => {
    expect(comSegundos(1.25)).toBe('00:01.3');
    expect(comSegundos(75.4)).toBe('01:15.4');
  });

  it('zero-padding para a régua não tremer', () => {
    expect(comSegundos(5)).toBe('00:05.0');
  });

  it('negativo vira zero em vez de texto quebrado', () => {
    expect(comSegundos(-3)).toBe('00:00.0');
  });
});
