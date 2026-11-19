import { describe, expect, it } from 'vitest';
import { luzDaSala } from '../luzDaSala';

// D-1137 (E-069 H-13; DIRECAO §3.6): que aurora a sala pinta e se o vidro desfoca.
const base = { tela: 'biblioteca' as const, temCapa: true, reduzirEfeitos: false, transparenciaReduzida: false, foco: false };

describe('luzDaSala', () => {
  it('fora do vídeo, com capa: a aurora da capa e o vidro desfocando', () => {
    expect(luzDaSala({ ...base, tela: 'metadados' })).toEqual({ aurora: 'capa', vidro: true });
  });

  it('sem capa, ficam só os halos', () => {
    expect(luzDaSala({ ...base, temCapa: false })).toEqual({ aurora: 'halos', vidro: true });
  });

  it.each(['cortes', 'pos'] as const)('no %s (vídeo tocando): só os halos e nenhum blur', (tela) => {
    expect(luzDaSala({ ...base, tela })).toEqual({ aurora: 'halos', vidro: false });
  });

  it('"Reduzir efeitos" tira a aurora e o vidro, em qualquer tela', () => {
    expect(luzDaSala({ ...base, reduzirEfeitos: true })).toEqual({ aurora: 'nenhuma', vidro: false });
    expect(luzDaSala({ ...base, tela: 'cortes', reduzirEfeitos: true })).toEqual({ aurora: 'nenhuma', vidro: false });
  });

  it('a transparência reduzida do sistema faz o mesmo que "Reduzir efeitos"', () => {
    expect(luzDaSala({ ...base, transparenciaReduzida: true })).toEqual({ aurora: 'nenhuma', vidro: false });
  });

  it('o modo foco também apaga a luz', () => {
    expect(luzDaSala({ ...base, foco: true })).toEqual({ aurora: 'nenhuma', vidro: false });
  });
});
