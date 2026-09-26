import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { duracaoEfetiva, lugarEfetivo, realceValido, tamanhoEfetivo } from '../ganchoDoShort';

// D-712: a herança do gancho (RN-12/13) está escrita aqui, para a prévia do
// short, e no backend, que desenha o render. A tabela é única e gerada pelo
// BACKEND (backend/tests/domain/test_heranca_gancho_d712.py); este teste confere
// que a prévia resolve cada caso do mesmo jeito que o render.

type Lugar = { x?: number | null; y?: number | null; largura?: number | null } | null;

interface Tabela {
  lugar: { proprio: Lugar; padrao: Lugar; efetivo: { x: number; y: number; largura: number } }[];
  tamanho: { entrada: number | null; efetivo: number }[];
  duracao: { entrada: number | null; efetivo: number }[];
  realce: { entrada: string | null; efetivo: string }[];
}

const TABELA = resolve(__dirname, '../../../../../backend/tests/fixtures/heranca_gancho_d712.json');
const tabela = JSON.parse(readFileSync(TABELA, 'utf-8')) as Tabela;

describe('a herança do gancho é a mesma do backend', () => {
  it.each(tabela.lugar.map((c) => [JSON.stringify([c.proprio, c.padrao]), c] as const))(
    'lugar %s',
    (_nome, caso) => {
      expect(lugarEfetivo(caso.proprio, caso.padrao)).toEqual(caso.efetivo);
    },
  );

  it.each(tabela.tamanho.map((c) => [String(c.entrada), c] as const))('tamanho %s', (_n, caso) => {
    expect(tamanhoEfetivo(caso.entrada)).toBe(caso.efetivo);
  });

  it.each(tabela.duracao.map((c) => [String(c.entrada), c] as const))('duração %s', (_n, caso) => {
    expect(duracaoEfetiva(caso.entrada)).toBe(caso.efetivo);
  });

  it.each(tabela.realce.map((c) => [String(c.entrada), c] as const))('realce %s', (_n, caso) => {
    expect(realceValido(caso.entrada)).toBe(caso.efetivo);
  });
});
