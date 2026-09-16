import type { Corte, StatusExportCorte } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// Prontidão do lote de publicação (D-439).
//
// Extraído de `ProjetoDetalhePage` em D-599 porque o Workspace passou a
// ter duas apresentações. O gate é regra de negócio, não layout: duas
// cópias significariam um dia o botão liberar numa tela e travar na
// outra, com o operador sem saber qual obedecer. Regra e comentários
// vieram inalterados.
// ─────────────────────────────────────────────────────────────

export interface ProntidaoPublicacao {
  /** Cortes que ainda vão ao ar (fora rejeitados e já publicados). */
  total: number;
  prontos: number;
  /** Libera o lote: há candidatos e nenhum deles está pendente. */
  liberado: boolean;
  /** Rótulo curto ao lado do botão. */
  resumo: string;
  /** Explicação do estado (tooltip do botão). */
  detalhe: string;
}

const MAX_PENDENTES_LISTADOS = 6;

const cortesPalavra = (quantidade: number) => (quantidade === 1 ? 'corte' : 'cortes');

/** O que falta num corte para ele bater `pronto_publicar` no backend. */
function faltasDoCorte(corte: StatusExportCorte): string[] {
  const faltas: string[] = [];
  if (!corte.video_pronto) faltas.push('render final');
  if (!corte.titulo_youtube) faltas.push('título');
  if (!corte.thumbnail_pronta) faltas.push('thumbnail');
  // O backend pode reprovar por algo que a tira de flags não expõe; sem o
  // fallback o tooltip sairia com "#3 ()".
  return faltas.length > 0 ? faltas : ['pendência no backend'];
}

/** Rótulo curto do chip ao lado do botão. */
function resumoDoLote(total: number, prontos: number, liberado: boolean): string {
  if (total === 0) return 'nada a publicar';
  if (liberado) return `tudo pronto · ${total} ${cortesPalavra(total)}`;
  return `${prontos}/${total} prontos`;
}

/** Texto do tooltip: por que o lote está (ou não) liberado. */
function detalheDoLote(total: number, pendentes: StatusExportCorte[]): string {
  if (total === 0) {
    return 'Nenhum corte aguardando publicação — todos já foram publicados ou rejeitados.';
  }
  if (pendentes.length === 0) {
    return `Tudo pronto — abrir o agendamento de ${total} ${cortesPalavra(total)}.`;
  }

  const listados = pendentes
    .slice(0, MAX_PENDENTES_LISTADOS)
    .map((c) => `#${c.numero} (${faltasDoCorte(c).join(', ')})`)
    .join(' · ');
  const excedente = pendentes.length - MAX_PENDENTES_LISTADOS;

  return (
    `Publicação em massa só libera com todos prontos. Faltam ${pendentes.length} de ${total}: ` +
    listados +
    (excedente > 0 ? ` · e mais ${excedente}` : '')
  );
}

/**
 * D-439: o lote só abre quando NÃO sobra pendência — antes o botão habilitava
 * com um único corte pronto, e não dava para ler na tela se a live inteira
 * estava fechada ou se faltava metade.
 *
 * "Candidato" é o corte que ainda vai ao ar: rejeitado é decisão editorial de
 * não publicar e publicado já foi — nenhum dos dois segura o lote. Corte ainda
 * em `proposto` conta como pendência: enquanto não for avaliado, a live não
 * está pronta.
 */
export function avaliarProntidaoPublicacao(
  cortes: StatusExportCorte[],
  statusPorCorte: Map<string, Corte>,
): ProntidaoPublicacao {
  const candidatos = cortes.filter(
    (c) => !c.youtube_url_publicado && statusPorCorte.get(c.corte_id)?.status !== 'rejeitado',
  );
  const pendentes = candidatos.filter((c) => !c.pronto_publicar);
  const total = candidatos.length;
  const prontos = total - pendentes.length;
  const liberado = total > 0 && pendentes.length === 0;

  return {
    total,
    prontos,
    liberado,
    resumo: resumoDoLote(total, prontos, liberado),
    detalhe: detalheDoLote(total, pendentes),
  };
}
