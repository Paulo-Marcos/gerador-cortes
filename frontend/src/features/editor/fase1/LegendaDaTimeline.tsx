import { ESTILO_DO_TRECHO, ROTULO_DO_TRECHO, type ClasseDoTrecho } from './origemDaBorda';

// D-1091 (E3 da D-1082): a legenda da linha do tempo, com os quatro casos.
// O quadradinho de cada um usa o mesmo estilo que pinta a onda (ESTILO_DO_TRECHO).
// O preenchimento dos que saem é neutro de propósito: na onda ele tem a cor da
// categoria, e a legenda só fala do que a borda e a altura dizem.

const CLASSES: ClasseDoTrecho[] = ['ia', 'voce', 'dentro'];
const PREENCHIMENTO_DO_QUE_SAI = 'color-mix(in oklab, var(--wb-text-mute) 35%, transparent)';

const QUADRO =
  'relative inline-block h-[10px] w-[14px] flex-none overflow-hidden rounded-[2px] border border-[var(--wb-border)]';

interface Props {
  /** A cor do corte na onda: o que fica. */
  corDoCorte: string;
}

export function LegendaDaTimeline({ corDoCorte }: Props) {
  return (
    <ul
      aria-label="Legenda da linha do tempo"
      className="mt-2 flex flex-none flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--wb-text-mute)]"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={QUADRO} style={{ background: corDoCorte }} />
        fica
      </li>
      {CLASSES.map((classe) => (
        <li key={classe} data-legenda={classe} className="flex items-center gap-1.5">
          <Quadradinho classe={classe} corDoCorte={corDoCorte} />
          {ROTULO_DO_TRECHO[classe]}
        </li>
      ))}
    </ul>
  );
}

function Quadradinho({ classe, corDoCorte }: { classe: ClasseDoTrecho; corDoCorte: string }) {
  const { border, top, height } = ESTILO_DO_TRECHO[classe];
  // O de dentro aparece como faixa dentro de um trecho, como na onda.
  const fundo = classe === 'dentro' ? PREENCHIMENTO_DO_QUE_SAI : corDoCorte;
  return (
    <span aria-hidden="true" className={QUADRO} style={{ background: fundo }}>
      <span
        className="absolute inset-x-0 box-border rounded-[1px]"
        style={{ top, height, border, background: PREENCHIMENTO_DO_QUE_SAI }}
      />
    </span>
  );
}
