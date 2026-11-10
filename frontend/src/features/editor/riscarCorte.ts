import type { Corte } from '@/types/models';

// ─────────────────────────────────────────────────────────────────
// D-1088 · Riscar o corte, no lugar de excluir.
//
// O R excluía o corte depois de um diálogo, e a proposta e o trabalho iam
// junto. Riscado, o corte fica no banco como `rejeitado`, com a proposta e o
// que o operador acertou, e a mídia sai como no Limpar. Por isso o R risca
// direto: não há o que perder que não se refaça.
// ─────────────────────────────────────────────────────────────────

/** A dica do botão apagado: o vídeo no ar conta como entregue. */
export const DICA_NO_YOUTUBE = 'Já está no YouTube';

/** Por que este corte não se risca; `null` = pode riscar. */
export function bloqueioDoRiscar(corte: Pick<Corte, 'youtube_video_id'>): string | null {
  return corte.youtube_video_id ? DICA_NO_YOUTUBE : null;
}

export const estaRiscado = (corte: Pick<Corte, 'status'>) => corte.status === 'rejeitado';

/** D-1092: a lista "Cortes da live" mostra os vivos; os riscados vão para a seção do fim. */
export function separarRiscados(cortes: readonly Corte[]) {
  return {
    vivos: cortes.filter((corte) => !estaRiscado(corte)),
    riscados: cortes.filter(estaRiscado),
  };
}

/** O vizinho do corte na ordem (`delta` 1 = próximo, -1 = anterior), em volta,
 *  pulando os riscados — é o J/K da bancada (D-1092). Vale também quando o corte
 *  aberto é um riscado. `null` quando não sobra nenhum outro. */
export function corteVizinho(cortes: readonly Corte[], corteId: string, delta: -1 | 1): Corte | null {
  const indice = cortes.findIndex((corte) => corte.id === corteId);
  const n = cortes.length;
  // Fora da lista, o ponto de partida fica antes do primeiro (ou depois do último).
  let partida = indice;
  if (partida < 0) partida = delta > 0 ? -1 : n;
  for (let passo = 1; passo <= n; passo += 1) {
    const candidato = cortes[(((partida + delta * passo) % n) + n) % n];
    if (candidato.id !== corteId && !estaRiscado(candidato)) return candidato;
  }
  return null;
}

/** O corte para onde o editor segue depois de riscar: o próximo na ordem,
 *  pulando os já riscados. `null` quando não sobra nenhum. */
export function proximoDepoisDeRiscar(cortes: readonly Corte[], corteId: string): Corte | null {
  return corteVizinho(cortes, corteId, 1);
}

/** A linha do aviso: qual corte saiu, quanto disco voltou e o que ficou nele.
 *  `naoRemovidos`: arquivos que o Windows não deixou apagar (em uso). */
export function mensagemDoRiscado(
  corte: Pick<Corte, 'numero' | 'titulo_proposto'>,
  liberadoMb: number,
  naoRemovidos = 0,
): string {
  const disco = liberadoMb > 0 ? ` · ${formatarMb(liberadoMb)} liberados` : '';
  const ficou =
    naoRemovidos > 0
      ? ` · ${naoRemovidos} ${naoRemovidos === 1 ? 'arquivo em uso ficou' : 'arquivos em uso ficaram'} no disco`
      : '';
  return `#${corte.numero} · ${corte.titulo_proposto}${disco}${ficou}`;
}

function formatarMb(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
