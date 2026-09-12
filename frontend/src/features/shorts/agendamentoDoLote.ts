/**
 * D-580: a regra de "quando publicar", do lado da tela.
 *
 * Mora fora do componente porque não é desenho: é a resposta a uma pergunta que
 * o operador faz olhando para a caixa de data — *isso vai mesmo acontecer
 * sozinho?* Para cada destino a resposta é diferente, e é justamente essa
 * diferença que a tela precisa dizer antes de ele clicar, não depois.
 */

/** Quem honra a data sozinho, quem só a repassa como recado. */
export type ComoAgenda = 'sozinho' | 'a_mao';

export interface NotaDeAgendamento {
  plataforma: string;
  como: ComoAgenda;
  texto: string;
}

/**
 * O TikTok só agenda com o robô no volante: sem ele não há Chrome aberto para
 * clicar no Studio, e a data viraria um bilhete dentro de uma pasta.
 */
export function notasDeAgendamento(
  plataformas: string[],
  opcoes: { tiktokAssistido: boolean; instagramAssistido: boolean },
): NotaDeAgendamento[] {
  const notas: NotaDeAgendamento[] = [];

  if (plataformas.includes('youtube_shorts')) {
    notas.push({
      plataforma: 'YouTube Shorts',
      como: 'sozinho',
      texto: 'sobe privado e o próprio YouTube publica na hora marcada',
    });
  }

  if (plataformas.includes('tiktok')) {
    notas.push(
      opcoes.tiktokAssistido
        ? {
            plataforma: 'TikTok',
            como: 'sozinho',
            texto: 'o robô marca dia e hora no Studio antes de te devolver a aba',
          }
        : {
            plataforma: 'TikTok',
            como: 'a_mao',
            texto: 'sem o robô não há aba para marcar: ligue o assistido acima',
          },
    );
  }

  if (plataformas.includes('instagram_reels')) {
    notas.push({
      plataforma: 'Instagram Reels',
      como: 'a_mao',
      texto: 'não agenda: o compositor do Instagram não tem essa opção — publique na hora',
    });
  }

  return notas;
}

/** Minutos redondos de cinco em cinco — a grade que o seletor do TikTok tem. */
export const PASSO_EM_SEGUNDOS = 300;

/**
 * Uma sugestão de horário que já nasce válida: daqui a uma hora, arredondada
 * para baixo na grade de cinco minutos. Começar com um valor aceitável poupa o
 * operador de descobrir a regra pelo erro.
 */
export function sugestaoDeHorario(agora: Date = new Date()): string {
  const alvo = new Date(agora.getTime() + 60 * 60 * 1000);
  alvo.setMinutes(Math.floor(alvo.getMinutes() / 5) * 5, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${alvo.getFullYear()}-${pad(alvo.getMonth() + 1)}-${pad(alvo.getDate())}` +
    `T${pad(alvo.getHours())}:${pad(alvo.getMinutes())}`
  );
}
