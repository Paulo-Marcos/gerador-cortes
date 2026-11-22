import { janelaVertical } from './janelaEnquadramento';
import type { CSSProperties } from 'react';

// D-475: a janela 9:16 desenhada por cima do player.
//
// O que sai do quadro fica escurecido; o que fica tem moldura. É a diferença
// entre "confie no número 50%" e "olhe onde vai cortar" — e é o que permite ao
// operador julgar o enquadramento antes de gastar um render.
//
// Fica sobre o vídeo com `pointer-events-none`: os controles nativos do player
// continuam clicáveis por baixo.

interface Props {
  /** Dimensões reais do arquivo, lidas do elemento de vídeo. */
  largura: number;
  altura: number;
  /** Centro pretendido na horizontal, de 0 a 1. */
  focoX: number;
  /**
   * O que for desenhado DENTRO da janela 9:16 — hoje, a prévia da legenda
   * (D-479). Mora aqui porque a janela é o quadro do short: qualquer coisa
   * posicionada fora dela estaria prometendo um enquadramento que o render não
   * entrega. A janela é um container de consulta, então o conteúdo pode se
   * dimensionar em `cqw` e escalar junto com o player.
   */
  children?: React.ReactNode;
}

export function MascaraEnquadramento({ largura, altura, focoX, children }: Props) {
  const janela = janelaVertical(largura, altura, focoX);
  const direitaPct = 100 - janela.esquerdaPct - janela.larguraPct;
  // Vídeo já vertical: não há faixa escura a desenhar, mas a janela continua
  // existindo — é ela que hospeda a legenda (D-479). Apagar tudo aqui faria a
  // prévia sumir justamente no formato em que o short já está certo.
  const recorta = janela.larguraPct < 100;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {recorta && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-[var(--larg)] bg-black/60"
            style={{ '--larg': `${janela.esquerdaPct}%` } as CSSProperties}
          />
          <div
            className="absolute inset-y-0 right-0 w-[var(--larg)] bg-black/60"
            style={{ '--larg': `${direitaPct}%` } as CSSProperties}
          />
        </>
      )}
      <div
        className={
          recorta
            ? 'absolute inset-y-0 left-[var(--esq)] w-[var(--larg)] border-x-2 border-iris [container-type:inline-size]'
            : 'absolute inset-0 [container-type:inline-size]'
        }
        style={recorta ? ({ '--esq': `${janela.esquerdaPct}%`, '--larg': `${janela.larguraPct}%` } as CSSProperties) : undefined}
      >
        {recorta && (
          <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-[4px] bg-black/70 px-1.5 py-0.5 font-code text-micro font-bold tracking-wide text-white">
            9:16
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
