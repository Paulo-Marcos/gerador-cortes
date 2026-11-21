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
  forte: 'bg-iris-suave text-iris',
  medio: 'bg-iris-suave',
  fraco: 'bg-poco',
};

export function ReferenciaDoPublicoGrade({ grade, diasDaSemana, onTrocar, desabilitado }: Props) {
  const horas = Array.from({ length: HORAS }, (_, h) => h);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-micro">
        <thead>
          <tr>
            <th className="w-16" />
            {horas.map((h) => (
              <th
                key={h}
                scope="col"
                className="w-[18px] text-center font-normal text-fg-3"
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
                className="pr-2 text-right font-medium capitalize text-fg-2"
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
                      'block h-[18px] w-[18px] rounded-[3px] transition-colors hover:ring-2 hover:ring-foco disabled:cursor-not-allowed',
                      COR_DA_INTENSIDADE[intensidade],
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 flex flex-wrap items-center gap-3 text-micro text-fg-2">
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
