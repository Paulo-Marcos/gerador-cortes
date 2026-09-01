import { janelaVertical } from './janelaEnquadramento';

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
}

export function MascaraEnquadramento({ largura, altura, focoX }: Props) {
  const janela = janelaVertical(largura, altura, focoX);
  if (janela.larguraPct >= 100) return null;

  const direitaPct = 100 - janela.esquerdaPct - janela.larguraPct;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 bg-black/60"
        style={{ width: `${janela.esquerdaPct}%` }}
      />
      <div
        className="absolute inset-y-0 right-0 bg-black/60"
        style={{ width: `${direitaPct}%` }}
      />
      <div
        className="absolute inset-y-0 border-x-2 border-[var(--wb-accent)]"
        style={{ left: `${janela.esquerdaPct}%`, width: `${janela.larguraPct}%` }}
      >
        <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-[4px] bg-black/70 px-1.5 py-0.5 font-code text-[10px] font-bold tracking-wide text-white">
          9:16
        </span>
      </div>
    </div>
  );
}
