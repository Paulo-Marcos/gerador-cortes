import { SeloDeEstado } from '@/upgrade/SeloDeEstado';
import { dicaDaNota, lerNotaDoCorte } from './notaDoCorte';

/**
 * D-886: o selo "IA 22/30" — a nota que a IA deu ao corte, ao lado do estado.
 * É botão: clicar abre o porquê (o mesmo que a tecla W). Corte sem nota não
 * desenha nada, para não mostrar um selo vazio que pareça "nota zero".
 */
export function SeloDaNota({
  score,
  onAbrir,
}: {
  score: Record<string, number> | undefined;
  onAbrir: () => void;
}) {
  const nota = lerNotaDoCorte(score);
  if (!nota) return null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={dicaDaNota(nota)}
      aria-label={`Nota da IA ${nota.texto}. Ver por que a IA escolheu este corte`}
      style={{ flex: 'none', padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
    >
      <SeloDeEstado tom={nota.tom} ponto={false}>
        IA {nota.texto}
      </SeloDeEstado>
    </button>
  );
}
