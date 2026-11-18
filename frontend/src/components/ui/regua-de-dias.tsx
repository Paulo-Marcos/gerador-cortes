import * as React from 'react';
import type { TomDoSelo } from '@/components/ui/selo';
import { cn } from '@/lib/utils';

// D-1121 (E-069 H-11a) · Régua de dias: uma casa por dia, as lives de cada um (DIRECAO §7.1,
// "Os últimos 8 dias"). Dia com live é uma casa de vidro com a capa e o título; dia sem live
// é uma casa TRACEJADA (o vazio também é informação: "nesse dia não houve live").
//
// É só apresentação: quem escolhe os dias e agrupa as lives por data é a tela (a regra
// "últimos 8 dias" vive onde a lista de lives já está carregada). `hoje` e o ponto de estado
// chegam prontos. O ponto usa a MESMA cor do tom do `Selo` (§5): uma só tabela de estado.
// Vidro chapado, sem `backdrop-filter` (§3.6): são oito casas em linha.

export type LiveDoDia = {
  id: string;
  titulo: string;
  href: string;
  /** URL da capa 16:9. Sem ela a casa mostra só o título. */
  capa?: string;
  /** Estado da live no vocabulário do selo (statusMaps → tom, §5). */
  tom: TomDoSelo;
  /** Em palavras, para o leitor de tela: o ponto é cor e forma, não texto. */
  estado: string;
};

export type DiaDaRegua = {
  /** `AAAA-MM-DD`. */
  data: string;
  hoje?: boolean;
  lives: LiveDoDia[];
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "08 nov" e "dom": sem `Intl`, porque o resultado dele varia com o ICU de quem roda. */
export function rotuloDoDia(data: string): { dia: string; semana: string; completo: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return { dia: data, semana: '', completo: data };
  const [, ano, mes, dia] = m;
  const semana = SEMANA[new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia))).getUTCDay()];
  return {
    dia: `${dia} ${MESES[Number(mes) - 1]}`,
    semana,
    completo: `${semana}, ${dia} de ${MESES[Number(mes) - 1]}`,
  };
}

const PONTO: Record<TomDoSelo, string> = {
  inerte: '[--c:var(--cc-fg-3)]',
  neutro: '[--c:var(--cc-fg-2)]',
  curso: '[--c:var(--cc-info)]',
  convite: '[--c:var(--cc-aviso)]',
  ok: '[--c:var(--cc-ok)]',
  erro: '[--c:var(--cc-erro)]',
};

export interface ReguaDeDiasProps extends Omit<React.HTMLAttributes<HTMLOListElement>, 'children'> {
  dias: DiaDaRegua[];
}

export const ReguaDeDias = React.forwardRef<HTMLOListElement, ReguaDeDiasProps>(
  function ReguaDeDias({ dias, className, ...props }, ref) {
    return (
      <ol
        ref={ref}
        aria-label="Lives por dia"
        className={cn('grid list-none grid-cols-8 gap-2 p-0', className)}
        {...props}
      >
        {dias.map((d) => {
          const r = rotuloDoDia(d.data);
          const tem = d.lives.length > 0;
          return (
            <li
              key={d.data}
              data-dia={d.data}
              data-tem-live={tem ? 'sim' : 'nao'}
              aria-current={d.hoje ? 'date' : undefined}
              className={cn(
                'flex min-h-[92px] min-w-0 flex-col gap-2 rounded-bloco border p-2.5',
                tem ? 'border-solid border-fio bg-vidro shadow-topo' : 'border-dashed border-fio-2',
                d.hoje && 'border-fio-2 bg-vidro-2',
              )}
            >
              <p
                className={cn(
                  'flex items-center justify-between',
                  d.hoje ? 'text-fg' : 'text-fg-3',
                )}
              >
                <time dateTime={d.data} aria-label={r.completo} className="num">
                  {r.dia}
                </time>
                <span className="text-micro">
                  <span className="font-semibold">{d.hoje ? 'hoje' : r.semana}</span>
                </span>
              </p>
              {!tem && <span className="sr-only">Sem live neste dia</span>}
              {d.lives.map((l) => (
                <a
                  key={l.id}
                  href={l.href}
                  data-sala=""
                  className="flex min-w-0 items-center gap-2 rounded-etiqueta text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                >
                  {l.capa && (
                    <img
                      src={l.capa}
                      alt=""
                      className="h-[27px] w-12 flex-none rounded-etiqueta object-cover ring-1 ring-fio-2"
                    />
                  )}
                  <span className="line-clamp-2 min-w-0 flex-1 text-pequeno">
                    <span className="font-semibold">{l.titulo}</span>
                  </span>
                  <span
                    data-tom={l.tom}
                    role="img"
                    aria-label={l.estado}
                    title={l.estado}
                    className={cn('size-[7px] flex-none rounded-full bg-[var(--c)]', PONTO[l.tom])}
                  />
                </a>
              ))}
            </li>
          );
        })}
      </ol>
    );
  },
);
