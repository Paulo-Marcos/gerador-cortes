// D-493: a matemática de mover e redimensionar um bloco do palco.
//
// Espelha `domain/palco_short.aplicar_ajustes` nos LIMITES — o backend trava de
// novo tudo que chega, e é ele quem manda. A conta existe aqui para o arraste
// responder na hora: esperar o servidor a cada pixel deixaria o bloco andando
// atrás do cursor.
//
// O que NÃO está aqui, de propósito: o encaixe (cobrir/caber). Ele é do tipo de
// conteúdo — rosto corta, tela não — e não de onde o operador soltou o bloco.

/** Espelha `CANVAS` do domínio: o quadro do short. */
export const CANVAS = { largura: 1080, altura: 1920 } as const;

/** Espelha `_LADO_MINIMO`: abaixo disso o bloco some e leva a alça junto. */
export const LADO_MINIMO = 40;

export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Qual alça o operador pegou. `mover` é o corpo do bloco. */
export type Pega = 'mover' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * O retângulo depois de arrastar por (dx, dy), em pixels do CANVAS.
 *
 * Mover desliza inteiro e encosta nas bordas sem encolher — encolher ao bater
 * na borda faria o bloco mudar de tamanho por acidente, que é o tipo de coisa
 * que o operador desfaz sem entender o que fez.
 *
 * Redimensionar mantém o canto oposto parado, que é o que a mão espera.
 */
export function arrastarSlot(base: Retangulo, pega: Pega, dx: number, dy: number): Retangulo {
  if (pega === 'mover') {
    return {
      x: limitar(base.x + dx, 0, CANVAS.largura - base.w),
      y: limitar(base.y + dy, 0, CANVAS.altura - base.h),
      w: base.w,
      h: base.h,
    };
  }

  const puxaEsquerda = pega === 'nw' || pega === 'sw';
  const puxaTopo = pega === 'nw' || pega === 'ne';

  const direita = base.x + base.w;
  const baixo = base.y + base.h;

  let { x, y, w, h } = base;

  if (puxaEsquerda) {
    x = limitar(base.x + dx, 0, direita - LADO_MINIMO);
    w = direita - x;
  } else {
    w = limitar(base.w + dx, LADO_MINIMO, CANVAS.largura - base.x);
  }

  if (puxaTopo) {
    y = limitar(base.y + dy, 0, baixo - LADO_MINIMO);
    h = baixo - y;
  } else {
    h = limitar(base.h + dy, LADO_MINIMO, CANVAS.altura - base.y);
  }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/**
 * Um retângulo com um lado editado à mão, ainda dentro do quadro.
 *
 * Texto que não é número devolve `null`, e a tela mantém o valor anterior —
 * `Number('')` é `0`, e um campo que zera sozinho ao ser esvaziado joga o bloco
 * para o canto sem o operador ter pedido.
 */
export function aplicarCampo(
  base: Retangulo,
  lado: keyof Retangulo,
  texto: string,
): Retangulo | null {
  const limpo = (texto ?? '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;

  const bruto = { ...base, [lado]: Math.round(Number(limpo)) };
  return {
    x: limitar(bruto.x, 0, CANVAS.largura - LADO_MINIMO),
    y: limitar(bruto.y, 0, CANVAS.altura - LADO_MINIMO),
    w: limitar(bruto.w, LADO_MINIMO, CANVAS.largura - bruto.x),
    h: limitar(bruto.h, LADO_MINIMO, CANVAS.altura - bruto.y),
  };
}

/** Converte um deslocamento em pixels de TELA para pixels do canvas. */
export function paraCanvas(deltaTela: number, larguraNaTela: number): number {
  if (!(larguraNaTela > 0)) return 0;
  return (deltaTela * CANVAS.largura) / larguraNaTela;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, Math.max(minimo, maximo)));
}
