import type { Desvio } from '@/types/models';
import { janelaDo } from './legendaDoTrecho';

// D-1091 (E3 da D-1082): o que a linha do tempo diz de cada trecho que sai.
//
// Três casos além do "fica" (o resto do corte):
// - `ia`: a borda é a que a rodada da IA deu;
// - `voce`: a borda é do operador, porque ele a mexeu ou marcou o trecho à mão;
// - `dentro`: o trecho cabe inteiro dentro de outro e conta uma vez, porque o
//   render funde os sobrepostos (`mesclar_desvios_sobrepostos`).
//
// A origem não é campo novo: sai do carimbo que a rodada grava no desvio
// (`rodada` e `borda_da_rodada`, `domain/corte/riscados.py:carimbar_rodada`).

export type ClasseDoTrecho = 'ia' | 'voce' | 'dentro';

/** O texto da legenda de cada caso, na ordem em que ela os mostra. */
export const ROTULO_DO_TRECHO: Record<ClasseDoTrecho, string> = {
  ia: 'sai · borda da IA',
  voce: 'sai · borda ajustada por você',
  dentro: 'dentro de outro (conta uma vez)',
};

/**
 * Como cada caso se desenha, na onda e no quadradinho da legenda (a mesma fonte,
 * para as duas não divergirem). A origem vai na BORDA: o preenchimento segue a
 * cor da categoria, que liga a barra ao badge do card (D-515). O trecho de dentro
 * é uma faixa mais baixa, por cima do que o contém.
 */
export const ESTILO_DO_TRECHO: Record<ClasseDoTrecho, { border: string; top: string; height: string; zIndex: string }> = {
  ia: { border: '1px solid var(--wb-err)', top: '0%', height: '100%', zIndex: '1' },
  voce: { border: '2px solid var(--wb-ok)', top: '0%', height: '100%', zIndex: '1' },
  dentro: { border: 'none', top: '30%', height: '40%', zIndex: '2' },
};

/** A mesma folga de `_TOLERANCIA_BORDA_SEG` (riscados.py): o milissegundo do hms. */
const TOLERANCIA_DA_BORDA_SEG = 0.002;

/**
 * A borda é do operador? Espelha `_intacta` (riscados.py): com o carimbo, a borda
 * que saiu da que a rodada deu é dele. Sem carimbo (análise inicial, importação),
 * só o trecho marcado à mão é dele.
 */
export function bordaAjustadaPorVoce(desvio: Desvio): boolean {
  const borda = desvio.borda_da_rodada;
  if (desvio.rodada == null || !borda) return desvio.origem === 'manual';
  const { inicio, fim } = janelaDo(desvio);
  return (
    Math.abs(inicio - borda[0]) > TOLERANCIA_DA_BORDA_SEG ||
    Math.abs(fim - borda[1]) > TOLERANCIA_DA_BORDA_SEG
  );
}

/**
 * A classe de cada trecho, na ordem da lista. Dois trechos iguais: o primeiro
 * conta e o segundo fica "dentro", senão os dois se anulariam.
 */
export function classificarTrechos(desvios: Desvio[]): ClasseDoTrecho[] {
  const janelas = desvios.map(janelaDo);
  return desvios.map((desvio, i) => {
    const { inicio, fim } = janelas[i];
    const dentro = janelas.some((outra, j) => {
      if (j === i || outra.inicio > inicio || outra.fim < fim) return false;
      const igual = outra.inicio === inicio && outra.fim === fim;
      return !igual || j < i;
    });
    if (dentro) return 'dentro';
    return bordaAjustadaPorVoce(desvio) ? 'voce' : 'ia';
  });
}
