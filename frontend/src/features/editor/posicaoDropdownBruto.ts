// D-474: onde o painel de passos do bruto cabe na tela.
//
// Ele era `absolute right-0` — alinhava a borda DIREITA ao gatilho. Isso só
// funciona quando o gatilho está na direita da tela. Na aba Bruto o gatilho é o
// ícone de regerar, no INÍCIO da barra de ferramentas: o painel de 256px se
// estendia para a esquerda e sumia atrás da sidebar de projetos.
//
// A correção não é trocar para `left-0` — isso só inverteria o problema no
// outro gatilho. É calcular contra a VIEWPORT: alinha à direita quando cabe,
// escorrega para dentro quando não cabe, e nunca encosta na borda.

/** Respiro mínimo entre o painel e a borda da janela. */
const MARGEM = 8;

/** Distância entre o gatilho e o painel. */
const AFASTAMENTO = 4;

export interface Retangulo {
  left: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  largura: number;
  altura: number;
}

export interface PosicaoDropdown {
  left: number;
  top: number;
  /** Teto de altura: o painel rola por dentro em vez de vazar por baixo. */
  maxHeight: number;
}

export function posicionarDropdown(
  gatilho: Retangulo,
  viewport: Viewport,
  largura: number,
): PosicaoDropdown {
  // Preferência: borda direita do painel alinhada à do gatilho (o visual
  // original, que funciona bem quando há espaço à esquerda).
  const preferido = gatilho.right - largura;
  const maximo = viewport.largura - largura - MARGEM;

  const top = gatilho.bottom + AFASTAMENTO;
  return {
    left: Math.round(limitar(preferido, MARGEM, Math.max(MARGEM, maximo))),
    top: Math.round(top),
    maxHeight: Math.max(120, Math.round(viewport.altura - top - MARGEM)),
  };
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, maximo));
}
