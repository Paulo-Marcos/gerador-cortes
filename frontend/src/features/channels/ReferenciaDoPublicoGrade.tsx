// D-908: a grade 7 × 24 do público, clicável. Burra: recebe a grade e devolve
// o clique; quem guarda estado e salva é a seção.
//
// É o desenho do relatório "Quando seus espectadores estão no YouTube": o
// operador olha os dois lado a lado e pinta aqui o que vê lá. Três tons bastam
// — forte, médio, fraco — porque é isso que muda a decisão do escalonamento.
import { cn } from '@/lib/utils';
import {
  HORAS,
  ROTULO_DA_INTENSIDADE,
  resumoDoDia,
  type GradeDoPublico,
  type Intensidade,
} from './escalonamentoPublico';

interface Props {
  grade: GradeDoPublico;
  diasDaSemana: string[];
  onTrocar: (dia: number, hora: number) => void;
  desabilitado?: boolean;
}

const COR_DA_INTENSIDADE: Record<Intensidade, string> = {
  forte: 'bg-[var(--wb-accent)]',
  medio: 'bg-[var(--wb-accent-soft)]',
  fraco: 'bg-[var(--wb-bg-inset)]',
};

export function ReferenciaDoPublicoGrade({ grade, diasDaSemana, onTrocar, desabilitado }: Props) {
  const horas = Array.from({ length: HORAS }, (_, h) => h);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th className="w-16" />
            {horas.map((h) => (
              <th
                key={h}
                scope="col"
                className="w-[18px] text-center font-normal text-[var(--wb-text-dim)]"
              >
                {h % 3 === 0 ? h : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grade.map((linha, dia) => (
            <tr key={dia}>
              <th
                scope="row"
                className="pr-2 text-right font-medium capitalize text-[var(--wb-text-mute)]"
                title={resumoDoDia(linha)}
              >
                {diasDaSemana[dia] ?? dia}
              </th>
              {linha.map((intensidade, hora) => (
                <td key={hora} className="p-0">
                  <button
                    type="button"
                    disabled={desabilitado}
                    onClick={() => onTrocar(dia, hora)}
                    aria-label={`${diasDaSemana[dia] ?? dia} ${hora}h: ${ROTULO_DA_INTENSIDADE[intensidade]}`}
                    title={`${hora}h — ${ROTULO_DA_INTENSIDADE[intensidade]} (clique para trocar)`}
                    className={cn(
                      'block h-[18px] w-[18px] rounded-[3px] transition-colors hover:ring-2 hover:ring-[var(--wb-focus)] disabled:cursor-not-allowed',
                      COR_DA_INTENSIDADE[intensidade],
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--wb-text-mute)]">
        {(['forte', 'medio', 'fraco'] as const).map((i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className={cn('inline-block h-3 w-3 rounded-[3px]', COR_DA_INTENSIDADE[i])} />
            {ROTULO_DA_INTENSIDADE[i]}
          </span>
        ))}
        <span>· clique numa hora para trocar a força</span>
      </p>
    </div>
  );
}
