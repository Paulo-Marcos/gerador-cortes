import { describe, expect, it } from 'vitest';
import {
  ajustarLinha,
  chaveDaLinha,
  dataLegivel,
  escalona,
  paraEnvio,
  problemasDasLinhas,
  resumoDaAgenda,
} from '../agendaDoLote';
import type { LinhaDaAgenda } from '../loteApi';

/**
 * D-908. A previsão vem do backend; o que a tela promete é que ajustar UMA
 * linha não mexe nas outras, que o que vai no pedido é o que a lista mostra, e
 * que a linha com horário inválido é apontada antes do clique.
 */
function linha(alvo: string, plataforma: string, agendarPara: string, extra = {}): LinhaDaAgenda {
  return {
    alvo_tipo: 'short',
    alvo_id: alvo,
    plataforma,
    agendar_para: agendarPara,
    intensidade: agendarPara ? 'forte' : '',
    motivo: agendarPara ? '' : 'não cabe nos 10 dias que a plataforma deixa agendar',
    ...extra,
  };
}

const AGENDA = [
  linha('s1', 'tiktok', '2030-01-07T16:00'),
  linha('s2', 'tiktok', '2030-01-07T19:00'),
  linha('s3', 'tiktok', ''),
  linha('s1', 'instagram_reels', '', { motivo: 'publica no ato: o Instagram não agenda' }),
];

describe('ajustar uma linha', () => {
  it('troca só a linha pedida; as outras não se refazem', () => {
    const nova = ajustarLinha(AGENDA, chaveDaLinha(AGENDA[1]), '2030-01-08T10:00');

    expect(nova[1].agendar_para).toBe('2030-01-08T10:00');
    expect(nova[0]).toEqual(AGENDA[0]);
    expect(nova[2]).toEqual(AGENDA[2]);
  });

  it('a hora nova não herda a intensidade da hora velha', () => {
    const nova = ajustarLinha(AGENDA, chaveDaLinha(AGENDA[0]), '2030-01-07T03:00');

    expect(nova[0].intensidade).toBe('');
  });

  it('dar data a quem ficou sem apaga o motivo', () => {
    const nova = ajustarLinha(AGENDA, chaveDaLinha(AGENDA[2]), '2030-01-09T16:00');

    expect(nova[2].motivo).toBe('');
  });

  it('a chave distingue o mesmo short em redes diferentes', () => {
    expect(chaveDaLinha(AGENDA[0])).not.toBe(chaveDaLinha(AGENDA[3]));
  });
});

describe('o que vai no pedido', () => {
  it('só as redes que escalonam, com a data (ou vazio) que a lista mostra', () => {
    expect(paraEnvio(AGENDA)).toEqual([
      { alvo: 'short:s1', plataforma: 'tiktok', agendar_para: '2030-01-07T16:00' },
      { alvo: 'short:s2', plataforma: 'tiktok', agendar_para: '2030-01-07T19:00' },
      { alvo: 'short:s3', plataforma: 'tiktok', agendar_para: '' },
    ]);
  });

  it('o Instagram publica no ato e não escalona', () => {
    expect(escalona('instagram_reels')).toBe(false);
    expect(escalona('youtube_shorts')).toBe(true);
    expect(escalona('tiktok_horizontal')).toBe(true);
  });
});

describe('resumo e problemas', () => {
  it('conta com data, sem data e no ato', () => {
    expect(resumoDaAgenda(AGENDA)).toEqual({ comData: 2, semData: 1, noAto: 1 });
  });

  it('aponta a linha cujo horário não passa, pela regra da rede dela', () => {
    const agora = new Date('2030-01-07T10:00:00');
    const torta = ajustarLinha(AGENDA, chaveDaLinha(AGENDA[0]), '2030-01-07T16:03');

    const problemas = problemasDasLinhas(torta, agora);

    expect(problemas.get(chaveDaLinha(AGENDA[0]))).toContain('5 em 5 minutos');
    expect(problemas.has(chaveDaLinha(AGENDA[1]))).toBe(false);
  });

  it('linha sem data não é problema: é escolha visível', () => {
    expect(problemasDasLinhas(AGENDA, new Date('2030-01-07T10:00:00')).size).toBe(0);
  });

  it('a data se lê com o dia da semana', () => {
    expect(dataLegivel('2030-01-07T16:00')).toBe('seg 07/01 · 16:00');
    expect(dataLegivel('isso não é data')).toBe('isso não é data');
  });
});
