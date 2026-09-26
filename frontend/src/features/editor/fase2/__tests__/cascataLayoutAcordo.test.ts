import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLayoutChain } from '../youtubeLayout';

// D-712: a cascata do layout horizontal (RN-10) está escrita duas vezes — aqui,
// para o preview reagir a cada edição, e no backend, que resolve para o render.
// Duas cópias da mesma regra sempre divergem (a lição da D-558), e divergiam: a
// herança do modo e as regiões vindas do padrão saíam diferentes em 11 de 65
// casos. A tabela é única e gerada pelo BACKEND
// (backend/tests/domain/test_cascata_layout_d712.py); este teste confere a tela.

interface Caso {
  nome: string;
  corte: unknown;
  projeto: unknown;
  global: unknown;
  efetivo: unknown;
}

const TABELA = resolve(__dirname, '../../../../../../backend/tests/fixtures/cascata_layout_d712.json');
const { casos } = JSON.parse(readFileSync(TABELA, 'utf-8')) as { casos: Caso[] };

describe('a cascata do layout é a mesma do backend', () => {
  it('a tabela tem casos', () => {
    expect(casos.length).toBeGreaterThan(50);
  });

  it.each(casos.map((c) => [c.nome, c] as const))('%s', (_nome, caso) => {
    expect(resolveLayoutChain(caso.corte, caso.projeto, caso.global)).toEqual(caso.efetivo);
  });
});
