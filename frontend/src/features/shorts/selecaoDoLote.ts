// D-564: quem pode entrar no lote, e o que já foi.
//
// Aqui, e não dentro do modal, pelo motivo que a D-516 aprendeu na marra: regra
// de lista escondida num `useMemo` é regra que ninguém revisa — foi assim que a
// lista do TikTok herdou uma condição do YouTube e os cortes começaram a sumir
// dela. Fora do componente, a regra é legível e testável sem montar tela.
import type { PublicacaoRegistrada, ShortSugerido } from './shortsApi';

/** O prefixo que o backend usa para saber de qual arquivo montar o pacote. */
export const ALVO_SHORT = 'short';

/**
 * Os shorts que têm o que publicar: renderizados, com MP4 em disco.
 *
 * O status sozinho não basta — `renderizado` sem `arquivo_short_path` acontece
 * quando a limpeza levou o arquivo por fora do app, e oferecer esse short no
 * lote só produziria um erro lá na frente, depois de o operador ter escolhido.
 */
export function shortsPublicaveis(shorts: ShortSugerido[]): ShortSugerido[] {
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

/** Quantos pares (vídeo × plataforma) o lote realmente vai tentar subir. */
export function contarEnvios(
  ids: string[],
  plataformas: string[],
  publicacoes: PublicacaoRegistrada[],
): number {
  return ids.reduce((total, id) => {
    const jaFoi = plataformasJaPublicadas(publicacoes, id);
    return total + plataformas.filter((p) => !jaFoi.has(p)).length;
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
