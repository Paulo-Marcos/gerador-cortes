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

/** O corte para onde o editor segue depois de riscar: o próximo na ordem,
 *  pulando os já riscados. `null` quando não sobra nenhum. */
export function proximoDepoisDeRiscar(cortes: readonly Corte[], corteId: string): Corte | null {
  const indice = cortes.findIndex((corte) => corte.id === corteId);
  for (let passo = 1; passo <= cortes.length; passo += 1) {
    const candidato = cortes[(indice + passo + cortes.length) % cortes.length];
    if (candidato.id !== corteId && candidato.status !== 'rejeitado') return candidato;
  }
  return null;
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
