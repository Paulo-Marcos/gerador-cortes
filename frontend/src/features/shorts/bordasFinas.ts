import { frameStep, hmsParaSeg } from '@/features/editor/timeUtils';
import { arrastar, type Borda, type Bordas } from './linhaDoTempoShort';

// D-482: a precisão que o arraste não alcança.
//
// Arrastar resolve o grosso. Pegar exatamente o início de uma frase, não: numa
// régua de 10 minutos, meio segundo é menos de um pixel. O editor de cenas da
// pós-produção já tinha avanço fino; a curadoria de shorts não tinha.
//
// Duas formas de chegar lá, porque servem a momentos diferentes:
//
//   - **nudge**: você está ouvindo e a fala começa "um tiquinho" antes;
//   - **digitar**: você já sabe o tempo, porque leu na transcrição ou anotou.
//
// O TRAVAMENTO não é reimplementado aqui. Tanto o nudge quanto o valor digitado
// passam por `arrastar` (D-478) — a mesma função que a alça usa. Duas regras de
// borda que precisassem concordar acabariam discordando.

/** Um degrau de ajuste. `null` em `seg` significa "um quadro". */
export interface PassoFino {
  rotulo: string;
  seg: number | null;
}

/**
 * Os degraus oferecidos, do menor para o maior.
 *
 * Um quadro é o menor movimento com significado — abaixo disso o vídeo não
 * muda. Meio segundo é o degrau da sílaba: é o que separa "…que ninguém" de
 * "ninguém", que costuma ser a diferença entre um gancho e uma frase pela
 * metade.
 */
export const PASSOS_FINOS: readonly PassoFino[] = [
  { rotulo: '1f', seg: null },
  { rotulo: '0,5s', seg: 0.5 },
] as const;

/**
 * As bordas depois de empurrar `borda` por um degrau.
 *
 * `sentido` é -1 (para trás) ou 1 (para frente). O resultado passa pelas mesmas
 * travas do arraste: não sai do arquivo, e não atravessa a outra borda.
 */
export function empurrar(
  bordas: Bordas,
  borda: Borda,
  passo: PassoFino,
  sentido: -1 | 1,
  duracaoSeg: number,
): Bordas {
  const atual = borda === 'inicio' ? bordas.inicio : bordas.fim;
  const alvo =
    passo.seg === null ? frameStep(atual, sentido) : Math.max(0, atual + passo.seg * sentido);

  return arrastar(bordas, borda, alvo, duracaoSeg);
}

/**
 * O tempo que o operador digitou, em segundos — ou `null` quando não dá para ler.
 *
 * Aceita as três formas que alguém realmente digita:
 *
 *     00:01:23.500   como o resto do app escreve
 *     01:23.5        minuto e segundo, sem a hora que é sempre zero
 *     83.5           o número cru, quando veio de outro lugar
 *
 * Devolver `null` em vez de zero é deliberado: `hmsParaSeg` engole lixo e
 * responde `0`, e um campo que silenciosamente vira 00:00 ao receber um erro de
 * digitação move a borda para o começo do vídeo sem avisar.
 */
export function interpretarTempo(texto: string): number | null {
  const limpo = (texto ?? '').trim().replace(',', '.');
  if (!limpo) return null;

  if (/^\d+(\.\d+)?$/.test(limpo)) return Number(limpo);

  if (!/^\d{1,3}(:\d{1,2}){1,2}(\.\d{1,3})?$/.test(limpo)) return null;

  // `hmsParaSeg` espera H:MM:SS; mm:ss ganha a hora que faltava.
  const partes = limpo.split(':').length;
  return hmsParaSeg(partes === 2 ? `0:${limpo}` : limpo);
}

/**
 * O valor de `borda` depois de aplicar um tempo digitado, já travado.
 *
 * `null` quando o texto não é um tempo — aí a tela mantém o valor de antes e
 * marca o campo, em vez de gravar um palpite.
 */
export function aplicarTempoDigitado(
  bordas: Bordas,
  borda: Borda,
  texto: string,
  duracaoSeg: number,
): Bordas | null {
  const segundos = interpretarTempo(texto);
  if (segundos === null) return null;
  return arrastar(bordas, borda, segundos, duracaoSeg);
}
