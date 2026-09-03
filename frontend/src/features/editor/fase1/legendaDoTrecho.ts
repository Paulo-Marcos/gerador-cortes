import { hmsParaSeg } from '../timeUtils';
import type { Desvio, TranscricaoLinha } from '@/types/models';

// D-511: o que está sendo dito no trecho que vai ser removido.
//
// O card do trecho mostra o MOTIVO — "digressão", "repetição" — cortado em duas
// linhas. Duas coisas faltavam: o motivo inteiro, e o que a pessoa realmente
// falou ali. Sem o segundo, julgar um corte exige abrir a transcrição, achar o
// intervalo à mão e voltar; e com o texto cortado no meio nem o motivo dá para
// conferir.
//
// A legenda resolve o caso comum: assistindo ao bruto, quando a reprodução
// entra num trecho marcado para sair, o texto dele aparece sobre o vídeo. Ver o
// que se perde no momento em que se perde é o que permite discordar do corte.
//
// Funções puras: recebem transcrição e desvio, devolvem texto. Nada de I/O.

/** Quanto uma linha precisa invadir a janela para contar como dela. */
const SOBREPOSICAO_MINIMA_SEG = 0.15;

export interface JanelaDoTrecho {
  inicio: number;
  fim: number;
}

/**
 * Os segundos de início e fim do desvio.
 *
 * Existe para o resto do módulo não repetir a conversão de `hms`, que é o tipo
 * de detalhe que se escreve certo nove vezes e errado na décima.
 */
export function janelaDo(desvio: Desvio): JanelaDoTrecho {
  return { inicio: hmsParaSeg(desvio.inicio_hms), fim: hmsParaSeg(desvio.fim_hms) };
}

/**
 * O texto falado dentro do trecho, juntando as linhas que caem nele.
 *
 * Uma linha entra quando SOBREPÕE a janela de verdade, não quando apenas
 * encosta: a transcrição vem em blocos de vários segundos, e a linha que termina
 * no instante em que o trecho começa não diz nada sobre ele — incluí-la
 * mostraria uma frase que não é o motivo do corte.
 *
 * Devolve string vazia quando não há transcrição, e a tela então diz isso em
 * vez de mostrar uma legenda em branco.
 */
export function textoDoTrecho(linhas: TranscricaoLinha[], desvio: Desvio): string {
  const { inicio, fim } = janelaDo(desvio);
  if (!(fim > inicio)) return '';

  return linhas
    .filter((linha) => {
      const cobre = Math.min(linha.end, fim) - Math.max(linha.start, inicio);
      return cobre >= SOBREPOSICAO_MINIMA_SEG;
    })
    .map((linha) => linha.texto.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * O trecho que contém este instante, ou `null`.
 *
 * Espelha `findDesvioAtTime` no critério (início inclusivo, fim exclusivo) — dois
 * critérios diferentes fariam a legenda piscar meio quadro depois do salto
 * automático que o player já faz.
 */
export function trechoEm(desvios: Desvio[], segundo: number): Desvio | null {
  for (const desvio of desvios) {
    const { inicio, fim } = janelaDo(desvio);
    if (segundo >= inicio && segundo < fim) return desvio;
  }
  return null;
}

/**
 * A legenda a mostrar num instante: o texto do trecho, ou o motivo.
 *
 * Sem transcrição casada, o motivo é melhor que nada — ele ao menos diz por que
 * aquele pedaço foi marcado. Uma legenda vazia seria indistinguível de um bug.
 */
export function legendaEm(
  desvios: Desvio[],
  linhas: TranscricaoLinha[],
  segundo: number,
): { texto: string; motivo: string } | null {
  const desvio = trechoEm(desvios, segundo);
  if (!desvio) return null;

  const texto = textoDoTrecho(linhas, desvio);
  return { texto: texto || desvio.motivo || '', motivo: desvio.motivo || '' };
}
