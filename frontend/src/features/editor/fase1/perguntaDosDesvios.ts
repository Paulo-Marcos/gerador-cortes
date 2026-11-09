import type { Desvio } from '@/types/models';
import { hmsParaSeg } from '../timeUtils';

// D-1089 (P10, RN-36): o que a pergunta dos desvios diz de cada trecho e da rodada.

/** A mesma tolerância de `_intacta` (`backend/app/domain/corte/riscados.py`): o HMS guarda ms. */
const TOLERANCIA_BORDA_SEG = 0.002;

/**
 * De quem é a borda do trecho.
 * - `ia`: segue como a rodada deu; o "Desfazer rodada" leva.
 * - `ajustada`: veio da rodada, mas a borda foi mexida; pode voltar à da IA.
 * - `manual`: sem carimbo de rodada, marcado à mão desde o começo.
 *
 * Espelha `_intacta` do backend, mas lê a borda da tela: um arraste ainda não salvo
 * já muda o rótulo, sem esperar o Ctrl+S.
 */
export type BordaDoTrecho = 'ia' | 'ajustada' | 'manual';

export function bordaDoTrecho(desvio: Desvio): BordaDoTrecho {
  const borda = desvio.borda_da_rodada;
  if (desvio.rodada == null || !borda) return 'manual';
  const intacta =
    Math.abs(hmsParaSeg(desvio.inicio_hms) - borda[0]) <= TOLERANCIA_BORDA_SEG &&
    Math.abs(hmsParaSeg(desvio.fim_hms) - borda[1]) <= TOLERANCIA_BORDA_SEG;
  return intacta ? 'ia' : 'ajustada';
}

/** Quanto sai do corte: trecho dentro de outro conta uma vez, como no líquido. */
export function tempoQueSai(desvios: Desvio[]): number {
  const intervalos = desvios
    .map((d) => [hmsParaSeg(d.inicio_hms), hmsParaSeg(d.fim_hms)] as const)
    .filter(([ini, fim]) => fim > ini)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [ini, fim] of intervalos) {
    const de = Math.max(ini, cursor);
    if (fim > de) total += fim - de;
    cursor = Math.max(cursor, fim);
  }
  return total;
}

/** "17 s" abaixo de um minuto; "2:11" a partir dele — como no canvas da etapa Cortes. */
export function rotuloDoTempo(seg: number): string {
  const inteiro = Math.round(seg);
  if (inteiro < 60) return `${inteiro} s`;
  return `${Math.floor(inteiro / 60)}:${String(inteiro % 60).padStart(2, '0')}`;
}

const NOME_DO_PROVEDOR: Record<string, string> = { claude: 'Claude', gemini: 'Gemini' };

/** Quem fez a última rodada que ainda dá para desfazer; `null` se não for Claude nem Gemini. */
export function provedorDaUltimaRodada(desvios: Desvio[]): string | null {
  const intactas = desvios.filter((d) => bordaDoTrecho(d) === 'ia');
  const rodada = Math.max(...intactas.map((d) => d.rodada ?? 0));
  const origem = intactas.find((d) => d.rodada === rodada)?.origem;
  return (origem && NOME_DO_PROVEDOR[origem]) ?? null;
}
