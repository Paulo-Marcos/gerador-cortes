// D-564: quem pode entrar no lote, e o que já foi.
//
// Aqui, e não dentro do modal, pelo motivo que a D-516 aprendeu na marra: regra
// de lista escondida num `useMemo` é regra que ninguém revisa — foi assim que a
// lista do TikTok herdou uma condição do YouTube e os cortes começaram a sumir
// dela. Fora do componente, a regra é legível e testável sem montar tela.
import type { EstadoItemLote, PublicacaoRegistrada, ShortSugerido } from './shortsApi';

/**
 * O que o lote precisa de um short. D-611: a central de prontos traz shorts de
 * vários cortes num resumo próprio; `origem` diz de qual corte cada um veio,
 * porque numa lista misturada "Trecho 2" sozinho não identifica nada.
 */
export type ShortDoLote = Pick<
  ShortSugerido,
  'id' | 'numero' | 'titulo' | 'duracao_seg' | 'status' | 'arquivo_short_path'
> & { origem?: string };

/** O prefixo que o backend usa para saber de qual arquivo montar o pacote. */
export const ALVO_SHORT = 'short';

/**
 * Os shorts que têm o que publicar: renderizados, com MP4 em disco.
 *
 * O status sozinho não basta — `renderizado` sem `arquivo_short_path` acontece
 * quando a limpeza levou o arquivo por fora do app, e oferecer esse short no
 * lote só produziria um erro lá na frente, depois de o operador ter escolhido.
 */
export function shortsPublicaveis<T extends Pick<ShortSugerido, 'status' | 'arquivo_short_path'>>(
  shorts: T[],
): T[] {
  return shorts.filter((s) => s.status === 'renderizado' && Boolean(s.arquivo_short_path));
}

/**
 * As plataformas onde ESTE alvo já foi publicado de verdade.
 *
 * Só conta o que tem `publicado_em`: um pacote montado não é uma publicação, e
 * tratá-lo como tal esconderia do operador exatamente o que falta subir.
 */
export function plataformasJaPublicadas(
  publicacoes: PublicacaoRegistrada[],
  alvoId: string,
): Set<string> {
  return new Set(
    publicacoes.filter((p) => p.alvo_id === alvoId && p.publicado_em).map((p) => p.plataforma),
  );
}

/**
 * Quantos pares (vídeo × plataforma) o lote realmente vai tentar subir.
 *
 * D-590: com `republicar`, o que já foi volta a contar — é o mesmo pedido que o
 * backend recebe, e o número do botão não pode prometer menos do que sobe.
 */
export function contarEnvios(
  ids: string[],
  plataformas: string[],
  publicacoes: PublicacaoRegistrada[],
  republicar = false,
): number {
  if (republicar) return ids.length * plataformas.length;
  return ids.length * plataformas.length - contarRepublicacoes(ids, plataformas, publicacoes);
}

/**
 * D-590: quantos pares da seleção JÁ estão no ar.
 *
 * É o que decide se a opção de republicar aparece: oferecê-la sem nada
 * repetido na seleção seria uma pergunta sem assunto.
 */
export function contarRepublicacoes(
  ids: string[],
  plataformas: string[],
  publicacoes: PublicacaoRegistrada[],
): number {
  return ids.reduce((total, id) => {
    const jaFoi = plataformasJaPublicadas(publicacoes, id);
    return total + plataformas.filter((p) => jaFoi.has(p)).length;
  }, 0);
}

/** Os ids no formato que o backend espera: `"short:uuid"`. */
export function montarAlvos(ids: string[]): string[] {
  return ids.map((id) => `${ALVO_SHORT}:${id}`);
}

/** Liga/desliga um id numa seleção, sem mutar a anterior. */
export function alternar(selecionados: string[], id: string): string[] {
  return selecionados.includes(id)
    ? selecionados.filter((outro) => outro !== id)
    : [...selecionados, id];
}

/**
 * D-603: os estados em que "eu publiquei isso na mão" é uma frase possível.
 *
 * `erro` e `cancelado` entram porque são exatamente o caso que faltava: o robô
 * quebrou no meio e o operador terminou no app da rede — o vídeo está no ar e o
 * app não tem como saber. `sua_vez` já era o caso previsto.
 *
 * `aguardando` e `preparando` ficam de FORA, e não por pudor: a raia ainda vai
 * tentar subir esses dois. Marcar antes não cancelaria o envio — produziria um
 * vídeo duplicado no perfil, que é o erro mais caro que esta fila comete.
 * `pulado` também fica fora: ele só existe porque já está publicado.
 */
const MARCAVEIS: ReadonlySet<EstadoItemLote> = new Set<EstadoItemLote>([
  'sua_vez',
  'erro',
  'cancelado',
]);

export function podeMarcarAMao(estado: EstadoItemLote): boolean {
  return MARCAVEIS.has(estado);
}
