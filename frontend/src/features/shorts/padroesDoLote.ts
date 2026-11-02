// D-1011: com que o lote ABRE. O Paulo só publica pelos robôs, com os horários
// do canal e sem conferir o botão final; fazê-lo ligar isso a cada lote era
// trabalho sem decisão. Cada item continua desligável na tela.
import type { ModoDeQuando } from './agendaDoLote';

export const PADROES_DO_LOTE: {
  tiktokAssistido: boolean;
  instagramAssistido: boolean;
  publicarSozinho: boolean;
  modo: ModoDeQuando;
} = {
  tiktokAssistido: true,
  instagramAssistido: true,
  publicarSozinho: true,
  modo: 'distribuir',
};

// O Instagram ainda fica FORA da agenda: o robô publica no ato. Quando a D-1010
// (agendar Reels pelo Business Suite) entrar, vira `true` e o freio abaixo some.
export const INSTAGRAM_NA_AGENDA = false;

/**
 * Vários Reels com o robô no volante publicariam todos de uma vez. A flag
 * `publicar_sozinho` é uma só para os dois robôs, então o freio vale para o
 * lote inteiro: o robô para no botão final e o operador aperta.
 */
export function seguraPublicacaoDoInstagram(
  instagramRoboNoLote: boolean,
  trechos: number,
  instagramNaAgenda: boolean = INSTAGRAM_NA_AGENDA,
): boolean {
  return !instagramNaAgenda && instagramRoboNoLote && trechos > 1;
}
