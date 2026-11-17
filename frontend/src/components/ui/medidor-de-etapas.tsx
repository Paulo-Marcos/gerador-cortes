import * as React from 'react';
import { cn } from '@/lib/utils';
import { resumoDaLinha, type EstadoDoPip, type Pip, type Tira } from '@/upgrade/tiraDoCorte';

// D-1121 (E-069 H-11a) · Medidor de etapas: oito traços em três grupos, no lugar das siglas
// `BRU CEN GRD OVL FIN THU MET YT` (DIRECAO §5). Sigla de 3 letras não se lê; o medidor
// mostra ONDE o corte está e a FRASE ao lado diz o que falta ("3 de 8 · próximo: aplicar filtro").
//
// A regra (estado de cada etapa, grupo, "próxima") NÃO mora aqui: vem pronta de `montarTira`
// (`upgrade/tiraDoCorte.ts`). Este arquivo é só a roupa. Feito = `fg-2`; agora = `aviso`
// com brilho; falta = contorno; falha (corte rejeitado) = `erro`. Nunca o feixe (§3.1, §4.2).
//
// O traço é `role="img"` com o `aria-label` completo (contagem e verbo): os traços por dentro
// são decoração. O nome de cada etapa fica no `title` (a mão do mouse) e em `data-etapa`;
// o popover com os oito nomes é da H-11b (menu/popover).

const TRACO: Record<EstadoDoPip, string> = {
  feito: 'bg-fg-2',
  agora: 'bg-aviso shadow-[0_0_8px_color-mix(in_srgb,var(--cc-aviso)_70%,transparent)]',
  falta: 'bg-transparent shadow-[inset_0_0_0_1px_var(--cc-fio-campo)]',
  rejeitado: 'bg-erro',
};

/** O nome do estado como o medidor o conta: `rejeitado` é a "falha" do contrato (§5). */
const ESTADO_DO_TRACO: Record<EstadoDoPip, string> = {
  feito: 'feito',
  agora: 'agora',
  falta: 'falta',
  rejeitado: 'falha',
};

const DICA_DO_ESTADO: Record<EstadoDoPip, string> = {
  feito: 'feita',
  agora: 'é aqui que parou',
  falta: 'pendente',
  rejeitado: 'corte riscado',
};

/** O `title` do traço, com o nome para ler ("Filtro"), não a chave em inglês ("Graded"). */
const dicaDoTraco = (p: Pip) => `${p.etapa} — ${DICA_DO_ESTADO[p.estado]}`;

export interface MedidorDeEtapasProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'children'
> {
  tira: Tira;
  /** A frase ao lado. Ligada por padrão: o medidor sem ela é só um enfeite (§5). */
  comFrase?: boolean;
}

export const MedidorDeEtapas = React.forwardRef<HTMLSpanElement, MedidorDeEtapasProps>(
  function MedidorDeEtapas({ tira, comFrase = true, className, ...props }, ref) {
    const frase = resumoDaLinha(tira);
    const rejeitado = tira.grupos.some((g) => g.pips.some((p) => p.estado === 'rejeitado'));
    return (
      <span
        ref={ref}
        className={cn('inline-flex min-w-0 items-center gap-2.5', className)}
        {...props}
      >
        <span
          role="img"
          aria-label={`Etapas do corte: ${frase}`}
          className="inline-flex flex-none items-center gap-[5px]"
        >
          {tira.grupos.map((g) => (
            <span key={g.nome} data-grupo={g.nome} className="inline-flex gap-0.5">
              {g.pips.map((p) => (
                <b
                  key={p.nome}
                  data-etapa={p.etapa}
                  data-estado={ESTADO_DO_TRACO[p.estado]}
                  title={dicaDoTraco(p)}
                  className={cn('block h-[5px] w-3 rounded-pilula', TRACO[p.estado])}
                />
              ))}
            </span>
          ))}
        </span>
        {comFrase && (
          <span className="text-pequeno truncate">
            <span className={rejeitado ? 'text-erro' : 'text-fg-3'}>{frase}</span>
          </span>
        )}
      </span>
    );
  },
);
