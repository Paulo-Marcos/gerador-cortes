import { describe, expect, it } from 'vitest';
import type { ProviderIA } from '@/lib/providerIa';
import { analisarComAsDuas, avisoDasDuas } from '../analiseComAsDuas';

// D-977: "Analisar a live" com as duas IAs roda o Claude e depois o Gemini.

describe('analisarComAsDuas', () => {
  it('roda o Claude e depois o Gemini, um de cada vez', async () => {
    const ordem: string[] = [];
    let emVoo = 0;
    const analisar = async (provider: ProviderIA) => {
      emVoo += 1;
      ordem.push(`${provider}:${emVoo}`);
      await Promise.resolve();
      emVoo -= 1;
      return { total_cortes: provider === 'claude' ? 6 : 4 };
    };

    const desfechos = await analisarComAsDuas(analisar);

    expect(ordem).toEqual(['claude:1', 'gemini:1']);
    expect(desfechos).toEqual([
      { provider: 'claude', ok: true, totalCortes: 6 },
      { provider: 'gemini', ok: true, totalCortes: 4 },
    ]);
  });

  it('avisa quem está analisando agora', async () => {
    const vez: ProviderIA[] = [];
    await analisarComAsDuas(async () => ({ total_cortes: 1 }), (p) => vez.push(p));
    expect(vez).toEqual(['claude', 'gemini']);
  });

  it('uma IA que falha não impede a outra', async () => {
    const analisar = async (provider: ProviderIA) => {
      if (provider === 'claude') throw new Error('cota do Claude acabou');
      return { total_cortes: 3 };
    };

    const desfechos = await analisarComAsDuas(analisar);

    expect(desfechos).toEqual([
      { provider: 'claude', ok: false, erro: 'cota do Claude acabou' },
      { provider: 'gemini', ok: true, totalCortes: 3 },
    ]);
  });
});

describe('avisoDasDuas', () => {
  it('diz quantos cortes cada IA trouxe', () => {
    expect(
      avisoDasDuas([
        { provider: 'claude', ok: true, totalCortes: 6 },
        { provider: 'gemini', ok: true, totalCortes: 0 },
      ]),
    ).toEqual({
      texto: 'Análise com as duas IAs: Claude trouxe 6 corte(s); Gemini trouxe 0 corte(s).',
      tom: 'success',
    });
  });

  it('com uma falha, ainda é sucesso e diz o motivo', () => {
    const aviso = avisoDasDuas([
      { provider: 'claude', ok: true, totalCortes: 5 },
      { provider: 'gemini', ok: false, erro: 'agy fora do ar' },
    ]);
    expect(aviso.tom).toBe('success');
    expect(aviso.texto).toContain('Gemini falhou (agy fora do ar)');
  });

  it('as duas falharam: é erro', () => {
    const aviso = avisoDasDuas([
      { provider: 'claude', ok: false, erro: 'a' },
      { provider: 'gemini', ok: false, erro: 'b' },
    ]);
    expect(aviso.tom).toBe('error');
  });
});
