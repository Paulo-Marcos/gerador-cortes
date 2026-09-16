// D-611: as regras da central de prontos, fora do componente.
//
// Pelo mesmo motivo do `selecaoDoLote`: regra de lista escondida num `useMemo`
// é regra que ninguém revisa. Aqui ela é legível e testável sem montar tela.
import type { ShortDoLote } from './selecaoDoLote';
import type { PublicacaoRegistrada, ShortPronto } from './shortsApi';

/** As três redes do short vertical, na ordem em que a tela as mostra. */
export const REDES_DO_SHORT = [
  { id: 'youtube_shorts', rotulo: 'YouTube' },
  { id: 'tiktok', rotulo: 'TikTok' },
  { id: 'instagram_reels', rotulo: 'Instagram' },
] as const;

export type FiltroDosProntos =
  | 'todos'
  | 'sem_post'
  | 'sem_capa'
  | (typeof REDES_DO_SHORT)[number]['id'];

/** Os filtros que respondem "o que falta": por rede, e o fecho (post e capa). */
export function filtrarProntos(prontos: ShortPronto[], filtro: FiltroDosProntos): ShortPronto[] {
  if (filtro === 'todos') return prontos;
  if (filtro === 'sem_post') return prontos.filter((p) => !p.post.gerado);
  if (filtro === 'sem_capa') return prontos.filter((p) => !p.capa.tem_capa);
  return prontos.filter((p) => p.pendentes.includes(filtro));
}

/** Quantos itens cada filtro mostraria — o número do chip. */
export function contarPorFiltro(prontos: ShortPronto[]): Record<FiltroDosProntos, number> {
  return {
    todos: prontos.length,
    sem_post: filtrarProntos(prontos, 'sem_post').length,
    sem_capa: filtrarProntos(prontos, 'sem_capa').length,
    youtube_shorts: filtrarProntos(prontos, 'youtube_shorts').length,
    tiktok: filtrarProntos(prontos, 'tiktok').length,
    instagram_reels: filtrarProntos(prontos, 'instagram_reels').length,
  };
}

/** De onde o short veio, curto o bastante para caber numa linha. */
export function origemDoPronto(pronto: ShortPronto): string {
  const corte = `Corte #${pronto.corte_numero}`;
  return pronto.projeto_titulo ? `${corte} · ${pronto.projeto_titulo}` : corte;
}

/**
 * O histórico no formato que o modal do lote já entende.
 *
 * A central já sabe onde cada short está no ar; reconstruir as linhas evita
 * que o modal consulte o histórico corte a corte só para descobrir o mesmo.
 */
export function publicacoesDosProntos(prontos: ShortPronto[]): PublicacaoRegistrada[] {
  return prontos.flatMap((p) =>
    p.publicadas.map((plataforma) => ({
      alvo_id: p.id,
      plataforma,
      estado: 'publicado' as const,
      url: '',
      detalhe: '',
      publicado_em: 'sim',
    })),
  );
}

/** Os prontos no formato do lote, com o corte de origem para desambiguar. */
export function paraOLote(prontos: ShortPronto[]): ShortDoLote[] {
  return prontos.map((p) => ({
    id: p.id,
    numero: p.numero,
    titulo: p.titulo,
    duracao_seg: p.duracao_seg,
    status: p.status,
    arquivo_short_path: p.arquivo_short_path,
    origem: origemDoPronto(p),
  }));
}

/**
 * As redes com que o lote abre: as que falta em pelo menos um dos escolhidos.
 *
 * Abrir só com o YouTube (o padrão da prateleira) obrigaria a marcar as outras
 * toda vez — e nesta tela o que se quer é justamente "subir o que falta".
 */
export function redesQueFaltam(prontos: ShortPronto[], ids: string[]): string[] {
  const escolhidos = prontos.filter((p) => ids.includes(p.id));
  return REDES_DO_SHORT.map((r) => r.id).filter((rede) =>
    escolhidos.some((p) => p.pendentes.includes(rede)),
  );
}
