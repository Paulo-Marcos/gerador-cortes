import { describe, expect, it } from 'vitest';
import {
  mesclarNoLayoutDoCorte,
  modoHerdado,
  resolveLayoutChain,
} from '@/shared/palco/youtubeLayout';

// D-966 (RN-10): `modo_padrao` gravado é decisão do operador; ausente herda.
// A tela adivinhava pela sentinela `{modo_padrao:'full', regioes:[]}`: escolher
// FULL num projeto COMP voltava para COMP, e adicionar região virava FULL.

const PROJETO_COMP = { modo_padrao: 'compartilhada' };
const REGIAO_COMP = { inicio: 10, fim: 20, modo: 'compartilhada' };

describe('modo do corte na cascata (D-966)', () => {
  it('o corte que escolhe FULL num projeto COMP fica em FULL', () => {
    const escolhido = mesclarNoLayoutDoCorte({}, { modo_padrao: 'full' });

    expect(resolveLayoutChain(escolhido, PROJETO_COMP).modo_padrao).toBe('full');
    expect(modoHerdado(escolhido)).toBe(false);
  });

  it('o projeto que escolhe FULL num global COMP fica em FULL', () => {
    expect(resolveLayoutChain(undefined, { modo_padrao: 'full' }, PROJETO_COMP).modo_padrao).toBe(
      'full',
    );
  });

  it('adicionar região não muda o modo herdado do projeto', () => {
    const comRegiao = mesclarNoLayoutDoCorte({}, { regioes: [REGIAO_COMP] });

    expect(resolveLayoutChain(comRegiao, PROJETO_COMP).modo_padrao).toBe('compartilhada');
    expect(modoHerdado(comRegiao)).toBe(true);
  });

  it('voltar a herdar apaga o modo gravado, sem tocar nas regiões', () => {
    const gravado = { modo_padrao: 'full', regioes: [REGIAO_COMP] };

    const herdando = mesclarNoLayoutDoCorte(gravado, { modo_padrao: null });

    expect(herdando).toEqual({ regioes: [REGIAO_COMP] });
    expect(resolveLayoutChain(herdando, PROJETO_COMP).modo_padrao).toBe('compartilhada');
  });

  it('o corte sem nada gravado herda', () => {
    expect(modoHerdado(undefined)).toBe(true);
    expect(modoHerdado('{}')).toBe(true);
    expect(modoHerdado('{quebrado')).toBe(true);
  });
});
