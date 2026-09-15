import { describe, expect, it } from 'vitest';
import { notasDeAgendamento, problemaDoHorario, sugestaoDeHorario } from '../agendamentoDoLote';

/**
 * D-580. O que estes testes guardam é a HONESTIDADE da tela: a caixa de data
 * parece a mesma para os três destinos, e os três fazem coisas diferentes com
 * ela. A nota é o que impede o operador de achar que marcou o Instagram.
 */
describe('notas de agendamento', () => {
  const semRobo = { tiktokAssistido: false, instagramAssistido: false };

  it('o YouTube agenda sozinho, pela API', () => {
    const [nota] = notasDeAgendamento(['youtube_shorts'], semRobo);

    expect(nota.como).toBe('sozinho');
    expect(nota.texto).toContain('privado');
  });

  it('o TikTok só agenda com o robô ligado', () => {
    const [sem] = notasDeAgendamento(['tiktok'], semRobo);
    const [com] = notasDeAgendamento(['tiktok'], { ...semRobo, tiktokAssistido: true });

    expect(sem.como).toBe('a_mao');
    expect(sem.texto).toContain('ligue o assistido');
    expect(com.como).toBe('sozinho');
  });

  it('o Instagram diz que simplesmente não agenda', () => {
    const [nota] = notasDeAgendamento(['instagram_reels'], {
      ...semRobo,
      instagramAssistido: true,
    });

    expect(nota.como).toBe('a_mao');
    // Ligar o robô não muda nada aqui, e é isso que a nota precisa dizer: não
    // é o robô que falta, é a opção que não existe naquela tela.
    expect(nota.texto).toContain('não tem essa opção');
  });

  it('só fala das plataformas escolhidas', () => {
    const notas = notasDeAgendamento(['youtube_shorts'], semRobo);

    expect(notas.map((n) => n.plataforma)).toEqual(['YouTube Shorts']);
  });
});

describe('sugestão de horário', () => {
  it('cai na grade de cinco minutos que o TikTok aceita', () => {
    const sugestao = sugestaoDeHorario(new Date('2026-09-12T10:07:33'));

    expect(sugestao.endsWith(':05')).toBe(true);
  });

  it('sugere daqui a uma hora, e não agora', () => {
    const sugestao = sugestaoDeHorario(new Date('2026-09-12T10:00:00'));

    expect(sugestao).toBe('2026-09-12T11:00');
  });
});

/**
 * A mesma regra que o backend aplica em `domain/agendamento.py`, dita ANTES do
 * clique. O backend continua recusando; o que muda é o operador não precisar
 * levar um 422 para descobrir que o horário ficou para trás com o modal aberto.
 */
describe('problema do horário', () => {
  const agora = new Date('2026-09-12T10:00:00');

  it('horário válido não tem problema', () => {
    expect(problemaDoHorario('2026-09-12T11:00', ['youtube_shorts'], agora)).toBeNull();
  });

  it('sem agendamento não tem problema', () => {
    expect(problemaDoHorario('', ['youtube_shorts'], agora)).toBeNull();
  });

  it('horário que já passou pede ao menos 5 minutos à frente', () => {
    expect(problemaDoHorario('2026-09-12T09:30', ['youtube_shorts'], agora)).toContain(
      '5 minutos',
    );
  });

  it('a menos de 5 minutos também é recusado, como no backend', () => {
    expect(problemaDoHorario('2026-09-12T10:05', ['youtube_shorts'], agora)).not.toBeNull();
    expect(problemaDoHorario('2026-09-12T10:10', ['youtube_shorts'], agora)).toBeNull();
  });

  it('fora da janela da plataforma diz até quantos dias', () => {
    expect(problemaDoHorario('2026-09-23T10:00', ['tiktok'], agora)).toContain('10 dias');
  });

  it('a janela que vale é a da plataforma mais curta do lote', () => {
    expect(
      problemaDoHorario('2026-09-23T10:00', ['youtube_shorts', 'tiktok'], agora),
    ).toContain('TikTok');
  });

  it('minuto fora da grade só importa com TikTok no lote', () => {
    expect(problemaDoHorario('2026-09-12T11:03', ['tiktok'], agora)).toContain('5 em 5');
    expect(problemaDoHorario('2026-09-12T11:03', ['youtube_shorts'], agora)).toBeNull();
  });
});
