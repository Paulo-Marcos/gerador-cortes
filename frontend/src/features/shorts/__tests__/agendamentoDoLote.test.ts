import { describe, expect, it } from 'vitest';
import { notasDeAgendamento, sugestaoDeHorario } from '../agendamentoDoLote';

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
