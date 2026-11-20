import type { CSSProperties } from 'react';
import { ESTILO_DO_TRECHO, ROTULO_DO_TRECHO, type ClasseDoTrecho } from './origemDaBorda';

// D-1091 (E3 da D-1082): a legenda da linha do tempo, com os quatro casos.
// D-1150 (E-069 H-17, DIRECAO §3.3 e §7.3): a linguagem passou a ser ACESO × APAGADO.
// O que fica é aceso; o que sai leva o véu listrado; a origem vai pelo contorno (íris =
// ajustado por você) e o "dentro de outro" pela altura. A decisão do Paulo de 09/11
// (opção A) continua: por baixo do véu, o tom é a cor da categoria (D-515).
// O quadradinho de cada caso usa o mesmo estilo que pinta a onda (ESTILO_DO_TRECHO),
// entregue por variável CSS (DIRECAO §9.3: sem `style` de aparência).

const CLASSES: ClasseDoTrecho[] = ['ia', 'voce', 'dentro'];

/** O que aparece na onda em cada caso, antes do que ele significa. */
export const NA_TELA: Record<ClasseDoTrecho, string> = {
  ia: 'véu listrado',
  voce: 'véu com contorno íris',
  dentro: 'faixa mais baixa',
};

// Neutro de propósito: na onda o tom do véu é a cor da categoria do trecho.
const TOM_NEUTRO = 'color-mix(in oklab, var(--cc-fg-2) 35%, transparent)';

const QUADRO =
  'relative inline-block h-2.5 w-3.5 flex-none overflow-hidden rounded-[2px] border border-fio-2 bg-[var(--fundo)]';

interface Props {
  /** A cor do corte na onda: o que fica. */
  corDoCorte: string;
}

export function LegendaDaTimeline({ corDoCorte }: Props) {
  return (
    <ul
      aria-label="Legenda da linha do tempo"
      className="mt-2 flex flex-none flex-wrap gap-x-4 gap-y-1 text-micro text-fg-2"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={QUADRO} style={{ '--fundo': corDoCorte } as CSSProperties} />
        <span>
          <strong className="font-semibold text-fg">fica</strong>, aceso
        </span>
      </li>
      {CLASSES.map((classe) => (
        <li key={classe} data-legenda={classe} className="flex items-center gap-1.5">
          <Quadradinho classe={classe} corDoCorte={corDoCorte} />
          <span>
            <strong className="font-semibold text-fg">{NA_TELA[classe]}</strong>
            {` · ${ROTULO_DO_TRECHO[classe]}`}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">o tom por baixo do véu é a cor da categoria</li>
    </ul>
  );
}

function Quadradinho({ classe, corDoCorte }: { classe: ClasseDoTrecho; corDoCorte: string }) {
  const { border, top, height, backgroundImage } = ESTILO_DO_TRECHO[classe];
  // O de dentro aparece como faixa dentro de um trecho, como na onda.
  const fundo = classe === 'dentro' ? TOM_NEUTRO : corDoCorte;
  const geometria = {
    '--fundo': fundo,
    '--borda': border,
    '--topo': top,
    '--altura': height,
    '--veu': backgroundImage,
  } as CSSProperties;
  return (
    <span aria-hidden="true" className={QUADRO} style={geometria}>
      <span className="absolute inset-x-0 top-[var(--topo)] box-border h-[var(--altura)] rounded-[1px] bg-[image:var(--veu)] [border:var(--borda)]" />
    </span>
  );
}
