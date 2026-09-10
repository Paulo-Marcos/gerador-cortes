import type { DestinoPublicacao, StatusExportCorte } from '@/types/models';

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

/** Um destino em que o corte CONSTA como publicado, pronto para ser liberado. */
export interface DestinoMarcado {
  destino: DestinoPublicacao;
  rotulo: string;
  /** O que o app sabe: a URL, a data. É o que o operador confere antes de soltar. */
  detalhe: string;
}

/**
 * D-566: onde este corte consta como publicado.
 *
 * A função existe porque "publicado" deixou de ser um estado terminal: o vídeo
 * pode ter sido apagado lá fora, e o operador precisa de um lugar para dizer
 * isso. Para escolher o destino, primeiro ele precisa VER em quais o app acha
 * que o vídeo está — e é essa lista.
 *
 * Vazia significa que não há nada a liberar; o botão nem aparece.
 *
 * O par desta lista no backend é `domain/liberacao_publicacao.py`: lá mora o que
 * cada destino APAGA, aqui o que ele MOSTRA. Um destino novo (Instagram, D-471)
 * precisa entrar nos dois — e é para isso que este parágrafo existe.
 */
export function destinosPublicados(corte: StatusExportCorte): DestinoMarcado[] {
  const marcados: DestinoMarcado[] = [];

  // O `youtube_video_id` entra no OU de propósito: é ele que o upload consulta
  // para se declarar idempotente. Um corte com id e sem URL continua preso —
  // e sem esta linha ele não apareceria na lista para ser solto.
  if (corte.youtube_url_publicado || corte.youtube_video_id) {
    marcados.push({
      destino: 'youtube',
      rotulo: 'YouTube',
      detalhe: corte.youtube_url_publicado || `vídeo ${corte.youtube_video_id}`,
    });
  }

  if (corte.tiktok_publicado_em) {
    marcados.push({
      destino: 'tiktok',
      rotulo: 'TikTok',
      detalhe: `confirmado em ${corte.tiktok_publicado_em.slice(0, 10)}`,
    });
  }

  return marcados;
}
