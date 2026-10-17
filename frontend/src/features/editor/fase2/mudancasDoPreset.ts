// D-951: o que acende "Atualizar preset" no modal de posição. Antes só contavam
// a configuração das telas, o fundo e a placa; os cards viajam dentro do
// `palco` do preset desde a D-923, mas mexer neles (posição, caixa do cheio,
// tamanho) não acendia nada — o posicionamento dos cards ficava fora do preset.

interface CaixaDoCard {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Os campos dos cards que um preset guarda (o resto do palco tem dono próprio). */
export interface CardsComparaveis {
  ocultos?: string[] | null;
  escala?: number | null;
  posicao?: { automatica?: boolean | null; x?: number | null; y?: number | null } | null;
  ajuste?: string | null;
  alinhamento_vertical?: string | null;
  alinhamento_horizontal?: string | null;
  zona_no_cheio?: CaixaDoCard | null;
}

/** A forma comparável: a caixa vazia (o "sem caixa" da edição) vale o mesmo que nenhuma. */
function assinatura(cards: CardsComparaveis): string {
  const zona = cards.zona_no_cheio && cards.zona_no_cheio.w > 0 && cards.zona_no_cheio.h > 0 ? cards.zona_no_cheio : null;
  return JSON.stringify({
    ocultos: [...(cards.ocultos ?? [])].sort(),
    escala: cards.escala ?? 1,
    posicao: cards.posicao ? { automatica: Boolean(cards.posicao.automatica), x: cards.posicao.x, y: cards.posicao.y } : null,
    ajuste: cards.ajuste ?? null,
    av: cards.alinhamento_vertical ?? null,
    ah: cards.alinhamento_horizontal ?? null,
    zona: zona && { x: zona.x, y: zona.y, w: zona.w, h: zona.h },
  });
}

/** Os cards que o preset guardou; o preset antigo, sem palco, compara com o que está salvo. */
export function cardsDoPreset(
  payload: unknown,
  salvos: CardsComparaveis | null | undefined,
): CardsComparaveis | null | undefined {
  const palco = payload && typeof payload === 'object' ? (payload as { palco?: { cards?: CardsComparaveis } }).palco : undefined;
  return palco?.cards ?? salvos;
}

export function cardsMudaram(
  doPreset: CardsComparaveis | null | undefined,
  atuais: CardsComparaveis | null | undefined,
): boolean {
  if (!doPreset || !atuais) return false;
  return assinatura(doPreset) !== assinatura(atuais);
}

/** Se algo do modal divergiu do preset selecionado — telas, fundo, placa ou cards. */
export function mudouDesdeOPreset<T>({
  configOriginal,
  configMudou,
  extras,
  fundo,
  placa,
  cards,
}: {
  configOriginal: T | null;
  configMudou: (original: T) => boolean;
  extras: { fundo?: unknown; placa?: { nome?: string; papel?: string } };
  fundo: unknown;
  placa: { nome?: string; papel?: string };
  cards: { doPreset: CardsComparaveis | null | undefined; atuais: CardsComparaveis | null | undefined };
}): boolean {
  if (configOriginal === null) return false;
  return (
    configMudou(configOriginal) ||
    (extras.fundo != null && extras.fundo !== fundo) ||
    (extras.placa != null && (extras.placa.nome !== placa.nome || extras.placa.papel !== placa.papel)) ||
    cardsMudaram(cards.doPreset, cards.atuais)
  );
}
