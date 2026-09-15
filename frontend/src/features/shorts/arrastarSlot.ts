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
 * O quadro dentro do qual o retângulo se move.
 *
 * D-499: a mesma matemática passou a servir a dois quadros. O SLOT vive no
 * canvas do short (1080x1920); o RECORTE vive no quadro-fonte, que tem a
 * resolução do bruto e varia de live para live. A conta é a mesma — o que muda
 * é onde ficam as bordas —, e escrevê-la duas vezes criaria a divergência que
 * este épico passou inteiro evitando.
 */
export interface Limites {
  largura: number;
  altura: number;
}

/**
 * O retângulo depois de arrastar por (dx, dy), em pixels do CANVAS.
 *
 * Mover desliza inteiro e encosta nas bordas sem encolher — encolher ao bater
 * na borda faria o bloco mudar de tamanho por acidente, que é o tipo de coisa
 * que o operador desfaz sem entender o que fez.
 *
 * Redimensionar mantém o canto oposto parado, que é o que a mão espera.
 */
export function arrastarSlot(
  base: Retangulo,
  pega: Pega,
  dx: number,
  dy: number,
  limites: Limites = CANVAS,
): Retangulo {
  if (pega === 'mover') {
    return {
      x: limitar(base.x + dx, 0, limites.largura - base.w),
      y: limitar(base.y + dy, 0, limites.altura - base.h),
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
    w = limitar(base.w + dx, LADO_MINIMO, limites.largura - base.x);
  }

  if (puxaTopo) {
    y = limitar(base.y + dy, 0, baixo - LADO_MINIMO);
    h = baixo - y;
  } else {
    h = limitar(base.h + dy, LADO_MINIMO, limites.altura - base.y);
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
  limites: Limites = CANVAS,
): Retangulo | null {
  const limpo = (texto ?? '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;

  const bruto = { ...base, [lado]: Math.round(Number(limpo)) };
  return {
    x: limitar(bruto.x, 0, limites.largura - LADO_MINIMO),
    y: limitar(bruto.y, 0, limites.altura - LADO_MINIMO),
    w: limitar(bruto.w, LADO_MINIMO, limites.largura - bruto.x),
    h: limitar(bruto.h, LADO_MINIMO, limites.altura - bruto.y),
  };
}

// D-559: encolher o palco inteiro de uma vez.
//
// Arrastar as alças já dava para redimensionar um bloco desde a D-493 — só que
// no arranjo de TELA CHEIA o bloco ocupa os 1080x1920 exatos, e as quatro alças
// caem em cima da borda do quadro, numa prévia de 220px de largura. A operação
// existia e era impossível de acertar com a mão.
//
// E o pedido é sobre o conjunto, não sobre um bloco: "quero controlar o quanto
// da tela 9:16 eu vou ocupar... reduzir a imagem de modo que apareça o palco no
// fundo com o verde". Num arranjo de duas janelas, encolher só uma desalinharia
// as duas.
//
// Cada bloco encolhe em torno do PRÓPRIO centro: é o que mantém a composição
// que o arranjo montou — o que era de cima continua em cima, o que estava
// centrado continua centrado — e abre a moldura de fundo por igual em volta de
// cada janela.

/** Todos os blocos redimensionados por `fator`, cada um em torno do seu centro. */
export function redimensionarPalco(
  slots: Record<string, Retangulo>,
  fator: number,
  limites: Limites = CANVAS,
): Record<string, Retangulo> {
  const saida: Record<string, Retangulo> = {};
  for (const [nome, base] of Object.entries(slots)) {
    const w = limitar(Math.round(base.w * fator), LADO_MINIMO, limites.largura);
    const h = limitar(Math.round(base.h * fator), LADO_MINIMO, limites.altura);
    saida[nome] = {
      w,
      h,
      // O centro é o do bloco ATUAL, e o novo canto sai dele. Sem isto o bloco
      // encolheria para o canto superior esquerdo — que é o que acontece quando
      // se mexe só em `w`/`h` e se esquece de `x`/`y`.
      x: limitar(Math.round(base.x + base.w / 2 - w / 2), 0, limites.largura - w),
      y: limitar(Math.round(base.y + base.h / 2 - h / 2), 0, limites.altura - h),
    };
  }
  return saida;
}

/**
 * Quanto da LARGURA do quadro o palco ocupa hoje, de 0 a 1.
 *
 * O número que o operador vê. Sai do bloco mais largo porque é ele que decide
 * se sobra faixa de fundo nas laterais — dois blocos empilhados com larguras
 * diferentes deixam ver a moldura pela mais estreita, e é a mais larga que diz
 * se ela aparece.
 */
export function ocupacaoDoPalco(
  slots: Record<string, Retangulo>,
  limites: Limites = CANVAS,
): number {
  const larguras = Object.values(slots).map((s) => s.w);
  if (larguras.length === 0) return 0;
  return Math.max(...larguras) / limites.largura;
}

// Onde cada região costuma estar no quadro do OBS: a pessoa num canto de baixo,
// a tela ocupando o resto. É só o ponto de partida — o operador arrasta dali.
const PONTO_DE_PARTIDA: Record<string, Retangulo> = {
  pessoa: { x: 0.02, y: 0.45, w: 0.3, h: 0.5 },
  tela: { x: 0.35, y: 0.05, w: 0.62, h: 0.7 },
};

/**
 * O retângulo com que uma região AINDA NÃO MARCADA nasce, em pixels do quadro.
 *
 * Existe porque o editor de recortes só arrastava o que já existia: sem a
 * região da tela, a tela dividida ficava bloqueada e não havia onde marcá-la.
 * Nasce num lugar plausível e dentro do quadro — um retângulo fora dele vira
 * `crop` inválido e derruba o render.
 */
export function recorteInicial(regiao: string, fonte: Limites): Retangulo {
  const fracao = PONTO_DE_PARTIDA[regiao] ?? { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const w = limitar(Math.round(fonte.largura * fracao.w), LADO_MINIMO, fonte.largura);
  const h = limitar(Math.round(fonte.altura * fracao.h), LADO_MINIMO, fonte.altura);
  return {
    x: limitar(Math.round(fonte.largura * fracao.x), 0, fonte.largura - w),
    y: limitar(Math.round(fonte.altura * fracao.y), 0, fonte.altura - h),
    w,
    h,
  };
}

/** Converte um deslocamento em pixels de TELA para pixels do quadro. */
export function paraCanvas(
  deltaTela: number,
  larguraNaTela: number,
  larguraDoQuadro: number = CANVAS.largura,
): number {
  if (!(larguraNaTela > 0)) return 0;
  return (deltaTela * larguraDoQuadro) / larguraNaTela;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, Math.max(minimo, maximo)));
}
