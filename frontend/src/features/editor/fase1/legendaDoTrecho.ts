import { hmsParaSeg } from '../timeUtils';
import type { Desvio } from '@/types/models';

// D-511/D-514: a JUSTIFICATIVA do trecho que vai ser removido, sobre o vídeo.
//
// O pedido original era "tem um texto e fica pela metade e eu não consigo
// verificar" — e o texto pela metade era o MOTIVO, cortado por um `line-clamp`
// de duas linhas. A D-511 leu isso como falta da transcrição e entregou as
// duas coisas: o motivo inteiro E a fala recortada da janela.
//
// A transcrição saiu (D-514). Quem julga o corte já está ouvindo a fala — ela
// não precisa estar escrita também; o que não dava para saber era POR QUE
// aquele pedaço foi marcado. Menos texto sobre o vídeo é mais vídeo visível.
//
// Funções puras: recebem o desvio, devolvem texto. Nada de I/O.

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
 * A legenda a mostrar num instante: a justificativa do trecho.
 *
 * `rotulo` é a etiqueta curta (a categoria) e `texto` é o motivo por extenso.
 * Os dois separados porque ocupam lugares diferentes na tela — a etiqueta numa
 * pílula, o motivo como legenda —, e juntá-los daria a primeira versão desta
 * demanda: um rótulo de três linhas tapando o quadro.
 */
export function legendaEm(desvios: Desvio[], segundo: number): { texto: string; rotulo: string } | null {
  const desvio = trechoEm(desvios, segundo);
  if (!desvio) return null;

  return { texto: (desvio.motivo || '').trim(), rotulo: rotuloDo(desvio) };
}

/**
 * O rótulo curto do trecho: a categoria, e não o motivo inteiro.
 *
 * A primeira versão pôs o motivo no rótulo — e um motivo de três linhas ocupava
 * meio quadro, tapando justamente o vídeo que se está avaliando. O motivo é a
 * legenda; aqui só precisa caber a etiqueta.
 */
export function rotuloDo(desvio: Desvio): string {
  const categoria = (desvio.categoria || '').trim();
  if (categoria) return categoria;
  const motivo = (desvio.motivo || '').trim();
  return motivo.length <= LIMITE_DO_ROTULO ? motivo : '';
}

/** Acima disso o rótulo vira parágrafo e come o quadro. */
const LIMITE_DO_ROTULO = 28;
