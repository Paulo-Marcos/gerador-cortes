import type { PalcoShortPreset } from '@/types/presets';
import type { AtualizarShortBody, ShortSugerido } from './shortsApi';

// D-552: o que gravar quando o operador escolhe um palco salvo.
//
// Aplicar um preset de palco COPIA valores — não cria vínculo vivo. Isso é
// decisão da D-509 e continua certa: o operador salva "assim que eu gosto",
// aplica noutro trecho, e dali em diante mexe à vontade sem que o preset o seja
// arrastado junto.
//
// O que faltava era a MARCA. Sem ela a tela não tinha como dizer de onde os
// valores vieram, e o preset que o operador acabava de criar sumia — ele
// aparecia no modal e em lugar nenhum além dele.
//
// Esta função é a tradução preset → PATCH, e mora fora do componente porque é
// onde um erro caberia: trocar um campo por outro aqui produz um palco
// plausível e errado, que ninguém percebe olhando a tela.

/**
 * O corpo do PATCH para aplicar `payload` como palco deste short.
 *
 * `payload` nulo é a volta ao "ajustado à mão": só limpa a marca, sem tocar em
 * nenhum valor. É o que permite desfazer a ETIQUETA sem desfazer o palco — se
 * limpasse os valores junto, escolher a opção vazia por engano destruiria o
 * ajuste que o operador acabou de fazer à mão.
 *
 * @example
 * mudancaDoPalco('', null)
 * // { palco_short_preset: '' }
 */
export function mudancaDoPalco(
  presetId: string,
  // `Partial` e o tipo honesto: um preset gravado antes da D-552 nao tem todas
  // as chaves, e e por isso que cada campo abaixo traz o seu default. Declarar
  // o tipo cheio obrigava quem chama a mentir com um cast — e foi um cast desses
  // (`as YoutubeBackgroundId` na previa) que derrubou a tela na D-554.
  payload: Partial<PalcoShortPreset> | null,
): AtualizarShortBody {
  if (!payload) return { palco_short_preset: presetId };

  return {
    palco_short_preset: presetId,
    // Cada campo com o seu default explícito: um preset antigo pode não ter a
    // chave, e `undefined` no PATCH significa "não mexa" — o que deixaria o
    // short com metade do palco novo e metade do antigo.
    arranjo_palco: payload.arranjo ?? '',
    janela_cheia: payload.janela_cheia ?? '',
    recortes_palco: payload.recortes ?? {},
    // D-561: o tamanho das janelas vem junto. Sem isto o preset descrevia meio
    // palco — arranjo e recortes vinham, o tamanho voltava ao do arranjo — e
    // parecia ter funcionado. Preset antigo não tem a chave, e `{}` é a
    // resposta certa: nenhum ajuste, ou seja, o tamanho que o arranjo monta.
    ajustes_palco: payload.ajustes ?? {},
    // `fundo` no preset é a TEXTURA (D-552), e não a cor da paleta que o campo
    // guardava quando a D-509 o criou. Presets salvos antes disso trazem uma
    // chave de cor aqui; ela não casa com nenhuma textura e o resolvedor cai no
    // padrão do canal — degradar para o default é melhor que recusar o preset.
    fundo_editorial: payload.fundo ?? '',
    // D-563: a legenda faz parte do palco — é a camada que vai por cima dele, e
    // a cor do realce foi escolhida OLHANDO para o fundo. Deixá-la de fora
    // faria o preset entregar o palco certo com o realce do trecho anterior.
    legenda_cor: payload.legenda_cor ?? '',
    legenda_fonte: payload.legenda_fonte ?? '',
    // D-594: a aparência do gancho SAIU daqui. Ela tem preset próprio, e um
    // palco que a carregasse daria dois donos para a cor do mesmo letreiro.
  };
}

/**
 * O palco de um short no formato que o preset guarda — o caminho de volta do
 * `mudancaDoPalco`.
 *
 * D-594: mora aqui, e não dentro do modal, porque agora são dois a tirar essa
 * foto: o modal do trecho ("guardar como preset") e o editor de preset do menu
 * de padrões. Duas cópias da lista de campos divergiriam no dia em que um
 * entrasse — foi assim que `fundo` e `ajustes` chegaram errados na D-561.
 */
/**
 * O trecho decidiu alguma parte do palco — espelho de `_tem_palco_proprio`.
 *
 * Sem nenhuma, ele SEGUE o palco padrão do corte, e o select tem de dizer isso.
 * Dizia "ajustado à mão": o vazio da marca de preset era lido como mão, e o
 * operador via "ajustado" num trecho em que nunca tinha tocado.
 */
export function temPalcoProprio(short: ShortSugerido): boolean {
  return Boolean(
    short.arranjo_palco ||
      short.janela_cheia ||
      short.fundo_editorial ||
      short.legenda_cor ||
      short.legenda_fonte ||
      short.palco_preset ||
      Object.keys(short.ajustes_palco ?? {}).length > 0 ||
      Object.keys(short.recortes_palco ?? {}).length > 0,
  );
}

/**
 * O PATCH que devolve o trecho ao palco padrão do corte: apaga o que ele
 * decidiu sobre o palco, e só isso — bordas e gancho não são do palco.
 */
export const SEGUIR_O_PALCO_PADRAO: AtualizarShortBody = {
  palco_short_preset: '',
  arranjo_palco: '',
  janela_cheia: '',
  recortes_palco: {},
  ajustes_palco: {},
  fundo_editorial: '',
  legenda_cor: '',
  legenda_fonte: '',
  palco_preset: '',
};

export function palcoDoShort(short: ShortSugerido): PalcoShortPreset {
  return {
    arranjo: short.arranjo_palco,
    janela_cheia: short.janela_cheia,
    recortes: short.recortes_palco ?? {},
    ajustes: short.ajustes_palco ?? {},
    // `fundo` no preset é a TEXTURA (`fundo_editorial`), não a chave de cor
    // da paleta que `fundo_palco` guarda — a troca que a D-561 corrigiu.
    fundo: short.fundo_editorial ?? '',
    legenda_cor: short.legenda_cor ?? '',
    legenda_fonte: short.legenda_fonte ?? '',
  };
}
