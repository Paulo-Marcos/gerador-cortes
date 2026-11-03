import { describe, expect, it } from 'vitest';
import { falaDoTrecho } from '../falaDoTrecho';
import type { Desvio, TranscricaoLinha } from '@/types/models';

const LINHAS: TranscricaoLinha[] = [
  { start: 10, end: 14, texto: 'a gente estava falando da classe média' },
  { start: 14, end: 18, texto: 'e aí, Veja bem, a classe média paga' },
  { start: 18, end: 22, texto: 'essa conta todo mês sem reclamar' },
  { start: 22, end: 26, texto: 'então vamos voltar para o tema' },
];

function trecho(campos: Partial<Desvio>): Desvio {
  return { inicio_hms: '00:00:14.000', fim_hms: '00:00:22.000', motivo: 'repete', ...campos };
}

describe('falaDoTrecho', () => {
  it('com citação, recorta exatamente o que a IA citou', () => {
    const fala = falaDoTrecho(trecho({ inicio_texto: 'veja bem', fim_texto: 'paga essa conta' }), LINHAS);

    expect(fala?.sai).toBe('Veja bem, a classe média paga essa conta');
    expect(fala?.antes).toBe('falando da classe média e aí,');
    expect(fala?.depois).toBe('todo mês sem reclamar então vamos');
  });

  it('acha a citação com outra caixa, acento e pontuação', () => {
    const fala = falaDoTrecho(trecho({ inicio_texto: 'A CLASSE MEDIA,', fim_texto: 'reclamar.' }), LINHAS);

    expect(fala?.sai.startsWith('a classe média paga')).toBe(true);
    expect(fala?.sai.endsWith('sem reclamar')).toBe(true);
  });

  it('frase repetida: fica a ocorrência mais perto do tempo do trecho', () => {
    const fala = falaDoTrecho(
      trecho({ inicio_hms: '00:00:16.000', inicio_texto: 'a classe média', fim_texto: 'paga' }),
      LINHAS,
    );

    expect(fala?.antes).toBe('classe média e aí, Veja bem,');
  });

  it('frase repetida no fim: a emenda fica na ocorrência que acaba perto da borda', () => {
    const repetida: TranscricaoLinha[] = [
      { start: 30, end: 32, texto: 'o imposto sobe todo ano' },
      { start: 32, end: 34, texto: 'o imposto sobe todo ano' },
      { start: 34, end: 36, texto: 'e acabou' },
    ];

    const fala = falaDoTrecho(
      trecho({ inicio_hms: '00:00:30.000', fim_hms: '00:00:32.000', inicio_texto: 'o imposto', fim_texto: 'o imposto sobe todo ano' }),
      repetida,
    );

    expect(fala?.sai).toBe('o imposto sobe todo ano');
    expect(fala?.depois).toBe('o imposto sobe todo ano e');
  });

  it('sem citação, estima pelo tempo dentro da linha', () => {
    const fala = falaDoTrecho(trecho({ inicio_hms: '00:00:18.000', fim_hms: '00:00:22.000' }), LINHAS);

    expect(fala?.sai).toBe('essa conta todo mês sem reclamar');
    expect(fala?.depois).toBe('então vamos voltar para o tema');
  });

  it('citação que não está na fala cai no tempo, sem inventar', () => {
    const fala = falaDoTrecho(
      trecho({ inicio_hms: '00:00:18.000', inicio_texto: 'ninguém disse isso', fim_hms: '00:00:22.000' }),
      LINHAS,
    );

    expect(fala?.sai).toBe('essa conta todo mês sem reclamar');
  });

  it('fala longa aparece pelo começo e pelo fim', () => {
    const longa = Array.from({ length: 60 }, (_, i) => `p${i}`).join(' ');
    const fala = falaDoTrecho(
      trecho({ inicio_hms: '00:01:00.000', fim_hms: '00:02:00.000' }),
      [{ start: 60, end: 120, texto: longa }],
    );

    expect(fala?.sai).toContain('p0 p1');
    expect(fala?.sai).toContain(' … ');
    expect(fala?.sai).toContain('p58 p59');
    expect(fala?.sai).not.toContain('p30');
  });

  it('marcador sem letras da legenda não vira palavra', () => {
    const fala = falaDoTrecho(
      trecho({ inicio_hms: '00:00:10.000', fim_hms: '00:00:14.000' }),
      [{ start: 10, end: 14, texto: 'não é [ __ ] velho' }],
    );

    expect(fala?.sai).toBe('não é velho');
  });

  it('transcrição que não cobre o trecho devolve null', () => {
    expect(falaDoTrecho(trecho({ inicio_hms: '01:00:00.000', fim_hms: '01:00:10.000' }), LINHAS)).toBeNull();
    expect(falaDoTrecho(trecho({}), [])).toBeNull();
  });
});
