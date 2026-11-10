import type { Desvio } from '@/types/models';
import { hmsParaSeg } from '../timeUtils';
import { bordaAjustadaPorVoce } from './origemDaBorda';

// D-1089 (P10, RN-36): o que a pergunta dos desvios diz de cada trecho e da rodada.

/**
 * O selo do trecho: `ia` ("Auto · borda da IA") ou `voce` ("Manual · você ajustou").
 * A regra é a da linha do tempo (`bordaAjustadaPorVoce`, D-1091), para a onda e o
 * painel nunca dizerem coisas opostas do mesmo trecho: com carimbo, a borda mexida é
 * sua; sem carimbo, só o trecho marcado à mão é seu — o silêncio do app e a análise
 * inicial são da IA. A borda da tela vale: um arraste ainda não salvo já muda o selo.
 */
export type BordaDoTrecho = 'ia' | 'voce';

export function classificarBorda(desvio: Desvio): BordaDoTrecho {
  return bordaAjustadaPorVoce(desvio) ? 'voce' : 'ia';
}

/** Tem borda da IA para onde voltar? Só o trecho da rodada cuja borda você mexeu. */
export function podeVoltarABordaDaIa(desvio: Desvio): boolean {
  return temCarimbo(desvio) && bordaAjustadaPorVoce(desvio);
}

function temCarimbo(desvio: Desvio): boolean {
  return desvio.rodada != null && !!desvio.borda_da_rodada;
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
  const intactas = desvios.filter((d) => temCarimbo(d) && !bordaAjustadaPorVoce(d));
  const rodada = Math.max(...intactas.map((d) => d.rodada ?? 0));
  const origem = intactas.find((d) => d.rodada === rodada)?.origem;
  return (origem && NOME_DO_PROVEDOR[origem]) ?? null;
}
