import type { StatusExportCorte } from '@/types/models';

// D-516: quem entra na lista de cada destino.
//
// Estavam como dois `useMemo` dentro da página, e um deles servia aos DOIS
// botões — foi assim que o TikTok herdou uma regra do YouTube e os cortes
// começaram a sumir da lista dele conforme eram publicados lá.
//
// Aqui em cima o contraste fica visível: as duas listas partem do mesmo
// material e divergem numa condição só, e essa condição é justamente a que não
// pode ser compartilhada.

/**
 * O que pode ir para o YouTube: pronto e AINDA NÃO publicado.
 *
 * O `!publicado` é a regra do destino — o YouTube não republica o mesmo corte,
 * e oferecê-lo de novo só cria duplicata.
 */
export function cortesParaYoutube(cortes: StatusExportCorte[]): StatusExportCorte[] {
  return cortes.filter((corte) => corte.pronto_publicar && !corte.youtube_url_publicado);
}

/**
 * O que pode ir para o TikTok: qualquer corte com MP4 final.
 *
 * SEM olhar o YouTube — e é aqui que a versão anterior errava. O corte que
 * acabou de subir no YouTube é exatamente o que tem vídeo pronto e ainda falta
 * no TikTok; filtrá-lo fazia a lista esvaziar conforme o outro destino avançava.
 *
 * Também sem exigir `pronto_publicar`: thumbnail e metadados do YouTube são
 * requisitos DAQUELE destino. Para montar um pacote de TikTok basta o arquivo.
 */
export function cortesParaTiktok(cortes: StatusExportCorte[]): StatusExportCorte[] {
  return cortes.filter((corte) => corte.video_pronto);
}

/** Os que ainda não foram confirmados como publicados no TikTok. */
export function pendentesNoTiktok(cortes: StatusExportCorte[]): StatusExportCorte[] {
  return cortesParaTiktok(cortes).filter((corte) => !corte.tiktok_publicado_em);
}
