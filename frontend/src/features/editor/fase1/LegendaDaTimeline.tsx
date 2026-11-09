import { ESTILO_DO_TRECHO, ROTULO_DO_TRECHO, type ClasseDoTrecho } from './origemDaBorda';

// D-1091 (E3 da D-1082): a legenda da linha do tempo, com os quatro casos.
// Decisão do Paulo (09/11, opção A): o preenchimento do que sai segue a cor da
// categoria (D-515), a origem vai pela borda e o "dentro de outro" pela altura.
// Por isso a legenda diz o que se VÊ na onda (a borda vermelha, a verde, a faixa
// mais baixa), e não usa o vermelho único do board. O quadradinho de cada caso
// usa o mesmo estilo que pinta a onda (ESTILO_DO_TRECHO).

const CLASSES: ClasseDoTrecho[] = ['ia', 'voce', 'dentro'];

/** O que aparece na onda em cada caso, antes do que ele significa. */
export const NA_TELA: Record<ClasseDoTrecho, string> = {
  ia: 'borda vermelha',
  voce: 'borda verde',
  dentro: 'faixa mais baixa',
};

// Neutro de propósito: na onda o preenchimento é a cor da categoria do trecho.
const PREENCHIMENTO_NEUTRO = 'color-mix(in oklab, var(--wb-text-mute) 35%, transparent)';

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
          <span>
            <strong className="font-semibold text-[var(--wb-text)]">{NA_TELA[classe]}</strong>
            {` · ${ROTULO_DO_TRECHO[classe]}`}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">o preenchimento é a cor da categoria</li>
    </ul>
  );
}

function Quadradinho({ classe, corDoCorte }: { classe: ClasseDoTrecho; corDoCorte: string }) {
  const { border, top, height } = ESTILO_DO_TRECHO[classe];
  // O de dentro aparece como faixa dentro de um trecho, como na onda.
  const fundo = classe === 'dentro' ? PREENCHIMENTO_NEUTRO : corDoCorte;
  return (
    <span aria-hidden="true" className={QUADRO} style={{ background: fundo }}>
      <span
        className="absolute inset-x-0 box-border rounded-[1px]"
        style={{ top, height, border, background: PREENCHIMENTO_NEUTRO }}
      />
    </span>
  );
}
