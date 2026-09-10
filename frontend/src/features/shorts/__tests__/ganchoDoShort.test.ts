import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contarPalavras,
  DURACAO_MAX_SEG,
  DURACAO_MIN_SEG,
  DURACAO_PADRAO_SEG,
  duracaoEfetiva,
  duracaoNoShort,
  ganchoVisivelEm,
  MAX_CARACTERES,
  PALAVRAS_MAX,
  PALAVRAS_MIN,
  recadoDoTom,
  tomDoGancho,
} from '../ganchoDoShort';

const DOMINIO_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/domain/gancho_short.py',
);

// A tela só pode prometer o que o render entrega. Como os projetos não
// compartilham módulo, as constantes são cópias — e é este bloco que impede que
// uma ponta mude sozinha e a prévia passe a mentir sobre o resultado.
describe('acordo com o domínio do backend', () => {
  const fonte = readFileSync(DOMINIO_DO_BACKEND, 'utf-8');

  function numeroDoDominio(nome: string): number {
    const encontrado = new RegExp(`^${nome}\\s*=\\s*([\\d.]+)`, 'm').exec(fonte);
    expect(encontrado, `${nome} sumiu do domínio do backend`).not.toBeNull();
    return Number(encontrado?.[1]);
  }

  it.each([
    ['PALAVRAS_MIN', PALAVRAS_MIN],
    ['PALAVRAS_MAX', PALAVRAS_MAX],
    ['MAX_CARACTERES', MAX_CARACTERES],
    ['DURACAO_PADRAO_SEG', DURACAO_PADRAO_SEG],
    ['DURACAO_MIN_SEG', DURACAO_MIN_SEG],
    ['DURACAO_MAX_SEG', DURACAO_MAX_SEG],
  ])('%s é o mesmo dos dois lados', (nome, naTela) => {
    expect(numeroDoDominio(nome)).toBe(naTela);
  });
});

describe('contarPalavras', () => {
  it('ignora espaço extra', () => {
    expect(contarPalavras('  ninguem   te  conta  isso ')).toBe(4);
  });

  it('texto em branco não tem palavra', () => {
    expect(contarPalavras('   ')).toBe(0);
  });
});

describe('tomDoGancho', () => {
  it('sem texto é vazio, não erro — short sem gancho é o caso comum', () => {
    expect(tomDoGancho('')).toBe('vazio');
    expect(tomDoGancho('  ')).toBe('vazio');
  });

  it('abaixo da faixa é curto', () => {
    expect(tomDoGancho('o erro')).toBe('curto');
  });

  it('dentro da faixa é ideal', () => {
    expect(tomDoGancho('o erro que todo mundo comete')).toBe('ideal');
  });

  it('acima da faixa é longo — mas continua salvável', () => {
    expect(tomDoGancho('uma dois tres quatro cinco seis sete oito')).toBe('longo');
  });

  it('todo tom tem um recado escrito', () => {
    for (const tom of ['vazio', 'curto', 'ideal', 'longo'] as const) {
      expect(recadoDoTom(tom).length).toBeGreaterThan(0);
    }
  });
});

describe('duracaoEfetiva', () => {
  it('valor útil passa intacto', () => {
    expect(duracaoEfetiva(3)).toBe(3);
  });

  it('curto demais sobe para o mínimo', () => {
    expect(duracaoEfetiva(0.2)).toBe(DURACAO_MIN_SEG);
  });

  it('longo demais desce para o máximo', () => {
    expect(duracaoEfetiva(30)).toBe(DURACAO_MAX_SEG);
  });

  it.each([null, undefined, 0, Number.NaN])('valor ilegível (%s) cai no padrão', (torto) => {
    expect(duracaoEfetiva(torto as number | null | undefined)).toBe(DURACAO_PADRAO_SEG);
  });
});

describe('duracaoNoShort', () => {
  it('não ultrapassa a duração do trecho', () => {
    expect(duracaoNoShort(5, 3)).toBe(3);
  });

  it('trecho longo não estica o gancho', () => {
    expect(duracaoNoShort(2.5, 40)).toBe(2.5);
  });

  it('sem duração conhecida mantém a pedida', () => {
    expect(duracaoNoShort(2.5, 0)).toBe(2.5);
  });
});

describe('ganchoVisivelEm', () => {
  it('está em tela na abertura', () => {
    expect(ganchoVisivelEm(0, 2.5, 30)).toBe(true);
    expect(ganchoVisivelEm(2.4, 2.5, 30)).toBe(true);
  });

  it('some quando o tempo acaba', () => {
    expect(ganchoVisivelEm(2.5, 2.5, 30)).toBe(false);
    expect(ganchoVisivelEm(10, 2.5, 30)).toBe(false);
  });

  it('antes do início do trecho não há gancho', () => {
    expect(ganchoVisivelEm(-1, 2.5, 30)).toBe(false);
  });
});
