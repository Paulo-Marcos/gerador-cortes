import type { CenaForaDoCorte } from './sceneValidation';

interface Props {
  fora: CenaForaDoCorte[];
  duracaoCorte: number;
}

function hms(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Denuncia cenas cujo tempo nao cabe no corte.
 *
 * Sem isto o defeito e SILENCIOSO: a timeline faz `max(duracao, maiorFimDeCena)`
 * e estica para acomodar a cena invalida, entao o operador ve um total maior que
 * o video (38:14 num bruto de 9 min) e o player roda vazio depois do fim real —
 * sem nenhuma pista de que a causa e uma cena com o tempo absoluto da live.
 */
export function AlertaCenasForaDoCorte({ fora, duracaoCorte }: Props) {
  if (fora.length === 0) return null;

  const pior = fora.reduce((max, cena) => (cena.inicio > max.inicio ? cena : max), fora[0]);

  return (
    <div
      role="alert"
      className="rounded-[var(--radius-xs)] border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-[var(--wb-text)]"
    >
      <b className="font-bold text-red-400">
        {fora.length} cena(s) com tempo fora do corte
      </b>{' '}
      — o corte termina em {hms(duracaoCorte)} e a cena {pior.indice + 1} comeca em{' '}
      {hms(pior.inicio)}, depois do fim. Ela nao aparece na timeline nem no video.
      Regere as cenas para reancora-las na transcricao do corte.
    </div>
  );
}
