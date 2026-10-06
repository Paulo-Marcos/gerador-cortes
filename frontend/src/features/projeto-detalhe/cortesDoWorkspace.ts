import type { Corte, StatusCorte, StatusExportCorte } from '@/types/models';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { estaAprovado } from '@/lib/statusDoCorte';

// ─────────────────────────────────────────────────────────────
// A lista de cortes do Workspace.
//
// Extraída de `ProjetoDetalhePage` em D-599. A lista NASCE dos cortes do
// projeto e só depois é enriquecida com o status de export — nunca o
// contrário. A inversão parece inofensiva e não é: corte recém-proposto
// ainda não tem linha em `export/status`, então partir do export faz a
// live com 7 cortes aparecer vazia. (Foi exatamente o que aconteceu na
// primeira versão da tela nova, o que é a melhor prova de que a regra
// precisava sair de dentro de um componente.)
// ─────────────────────────────────────────────────────────────

/** Todos os cortes (inclusive `proposto`), com os dados de export quando existem. */
export function mesclarCortesComExport(
  cortes: Corte[],
  statusExport: StatusExportCorte[],
): StatusExportCorte[] {
  const statusMap = new Map(statusExport.map((c) => [c.corte_id, c]));
  return cortes.map((c) => {
    const s = statusMap.get(c.id);
    if (s) return s;
    const videoPronto = !!(c.is_pos_producao === 1);
    return statusExportPendente({
      corte_id: c.id,
      numero: c.numero,
      titulo: c.titulo_proposto,
      raw_pronto: !!c.arquivo_clip_path,
      grade_pronta: videoPronto,
      overlays_prontos: videoPronto,
      video_pronto: videoPronto,
      youtube_url_publicado: c.youtube_url_publicado ?? '',
      youtube_scheduled_at: c.youtube_scheduled_at ?? '',
    });
  });
}

export type AcaoDaTecla = 'aprovar' | 'devolver' | 'excluir' | 'descer' | 'subir' | 'explicar';

/**
 * A triagem pelo teclado na linha focada do Workspace (D-746, D-842).
 *
 * A alterna: aprova o proposto e devolve a proposto o aprovado. R exclui o
 * corte de vez — quem chama pede confirmação antes, porque é a confirmação,
 * e não a tecla, que impede o irreversível num toque só. J/K andam entre as
 * linhas. W abre o porquê da IA e a nota dela (D-886). Sem corte carregado
 * (`status` indefinido), só a navegação vale.
 */
export function acaoDaTeclaNaLinha(
  tecla: string,
  status: StatusCorte | undefined,
): AcaoDaTecla | null {
  switch (tecla.toLowerCase()) {
    // D-865: J anterior (sobe), K próximo (desce) — o sentido do editor.
    case 'j':
      return 'subir';
    case 'k':
      return 'descer';
    case 'a':
      if (status === 'proposto') return 'aprovar';
      if (status && estaAprovado(status)) return 'devolver';
      return null;
    case 'r':
      return status ? 'excluir' : null;
    case 'w':
      return status ? 'explicar' : null;
    default:
      return null;
  }
}

/**
 * D-866: o subtítulo do Workspace. Os quatro cartões de números saíram (a
 * trilha conta Cortes, Pós e Publicado); o que só eles diziam — agendados e
 * o disco — passa a morar aqui, ao lado do que o subtítulo já contava.
 */
export function subDoWorkspace(n: {
  duracao: string;
  cortes: number;
  fires: number;
  publicados: number;
  agendados: number;
  arquivosLimpos: boolean;
}): string {
  return [
    `${n.duracao} de live`,
    `${n.cortes} cortes`,
    `${n.fires} fire`,
    n.publicados > 0 ? `${n.publicados} no ar` : 'nenhum no ar',
    ...(n.agendados > 0 ? [`+${n.agendados} agendados`] : []),
    n.arquivosLimpos ? 'mídia pesada apagada' : 'bruto guardado em disco',
  ].join(' · ');
}

/** A linha entra na lista? Busca por título ou número e, com o filtro "No ar"
 *  (aonde a etapa Publicado da trilha leva, D-866), só o que já subiu. */
export function linhaPassaNoFiltro(
  status: StatusExportCorte,
  termo: string,
  soNoAr: boolean,
): boolean {
  if (soNoAr && !status.youtube_url_publicado) return false;
  return (
    !termo ||
    (status.titulo ?? '').toLowerCase().includes(termo) ||
    String(status.numero).includes(termo)
  );
}

/** Lista vazia: diz por quê, e só oferece analisar quando a live não tem
 *  corte nenhum — não quando a busca ou o filtro "No ar" esconderam todos. */
export function listaVaziaDoWorkspace(busca: string, soNoAr: boolean) {
  if (soNoAr) return { texto: 'Nenhum corte no ar ainda', ofereceAnalise: false };
  if (busca) return { texto: 'Nenhum corte com esse termo', ofereceAnalise: false };
  return { texto: 'Esta live ainda não tem cortes', ofereceAnalise: true };
}

/**
 * O lote age sobre o que se VÊ. Selecionar, buscar ou filtrar ("No ar") e
 * depois aprovar/devolver agia também nos cortes que a busca ou o filtro
 * esconderam — o "N selecionados" contava quem não estava na tela.
 */
export function selecionadosVisiveis(
  selecionados: ReadonlySet<string>,
  linhas: ReadonlyArray<{ status: { corte_id: string } }>,
): Set<string> {
  return new Set(linhas.map((l) => l.status.corte_id).filter((id) => selecionados.has(id)));
}

/** Os cortes sobre os quais o lote age: selecionados E visíveis. */
export function alvosDoLote<C extends { id: string }>(
  cortes: C[],
  selecao: ReadonlySet<string>,
  linhas: ReadonlyArray<{ status: { corte_id: string } }>,
): C[] {
  const visiveis = selecionadosVisiveis(selecao, linhas);
  return cortes.filter((c) => visiveis.has(c.id));
}

/** ▲/▼ trocam o corte com o vizinho na ordem da LIVE; com a lista filtrada o
 *  vizinho pode estar escondido, e o clique reordenaria às cegas. */
export function podeReordenar(busca: string, soNoAr: boolean): boolean {
  return !soNoAr && busca.trim() === '';
}

/** Desliga o filtro "No ar" sem perder o resto da URL. */
export function semFiltroNoAr(parametros: URLSearchParams): URLSearchParams {
  const resto = new URLSearchParams(parametros);
  resto.delete('filtro');
  return resto;
}
