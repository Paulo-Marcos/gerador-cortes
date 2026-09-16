import type { Corte, StatusExportCorte } from '@/types/models';

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
    return {
      corte_id: c.id,
      numero: c.numero,
      titulo: c.titulo_proposto,
      raw_pronto: !!c.arquivo_clip_path,
      grade_pronta: videoPronto,
      overlays_prontos: videoPronto,
      video_pronto: videoPronto,
      thumbnail_pronta: false,
      metadados_completos: false,
      pronto_publicar: false,
      youtube_url_publicado: c.youtube_url_publicado || undefined,
      youtube_scheduled_at: c.youtube_scheduled_at || undefined,
    };
  });
}
