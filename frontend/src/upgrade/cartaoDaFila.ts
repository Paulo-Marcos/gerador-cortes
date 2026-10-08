import type { LotePublicacao } from '@/features/shorts/shortsApi';
import type { QueueJob } from '@/shared/filaGlobal/useWorkbenchQueue';
import type { FilaDoTrilho } from './GlobalRail';

// D-897 · o lote de publicação conta como trabalho da fila.
//
// O lote não é um job da fila global: ele tem raias, e cada item espera em
// estados que um job não tem (a aba aberta esperando o clique dele, o post que
// pode ter saído). Por isso ele não entra na lista de jobs. Ele entra no
// RESUMO, para o cartão do trilho continuar avisando quando o operador troca
// de projeto, que é justamente quando o modal deixava de avisar.

/** Item que ficou com o operador: a máquina acabou e falta um gesto dele. */
const COM_VOCE = new Set(['sua_vez', 'conferir']);
const EM_ANDAMENTO = new Set(['aguardando', 'preparando']);

export interface ResumoDoLote {
  total: number;
  publicados: number;
  /** Itens parados à espera do operador (clicar Publicar, conferir na aba). */
  comVoce: number;
  /** A máquina ainda tem o que fazer. */
  emCurso: boolean;
  cancelado: boolean;
  /** 0–100: a fatia de itens que já saíram da mão da máquina. */
  progresso: number;
}

export function resumoDoLote(lote: LotePublicacao): ResumoDoLote {
  const itens = lote.raias.flatMap((r) => r.itens);
  const total = itens.length;
  const andando = itens.filter((i) => EM_ANDAMENTO.has(i.estado)).length;
  return {
    total,
    publicados: itens.filter((i) => i.estado === 'publicado').length,
    comVoce: itens.filter((i) => COM_VOCE.has(i.estado)).length,
    emCurso: !lote.terminou,
    cancelado: lote.cancelado,
    progresso: total === 0 ? 100 : Math.round(((total - andando) / total) * 100),
  };
}

/** O lote ainda pede atenção: a máquina corre ou há item esperando o operador. */
export function lotePedeAtencao(resumo: ResumoDoLote | null): resumo is ResumoDoLote {
  return Boolean(resumo && (resumo.emCurso || resumo.comVoce > 0));
}

/** A linha curta do lote, no cartão e no cabeçalho da seção. */
export function textoDoLote(resumo: ResumoDoLote): string {
  const publicados = `${resumo.publicados}/${resumo.total} publicado${resumo.total === 1 ? '' : 's'}`;
  return resumo.comVoce > 0 ? `${publicados} · ${resumo.comVoce} com você` : publicados;
}

/** A linha sob o título da gaveta. D-897: com só o lote na fila, ela não pode dizer "vazia". */
export function resumoDaGaveta(jobs: QueueJob[], comLote: boolean): string {
  const ativos = jobs.filter((j) => j.estado === 'rodando' || j.estado === 'aguardando').length;
  const lote = comLote ? ' · lote de publicação' : '';
  if (jobs.length === 0) return comLote ? 'lote de publicação' : 'vazia';
  return `${ativos} ativo${ativos === 1 ? '' : 's'} · ${jobs.length} na lista${lote}`;
}

/**
 * O cartão da fila no pé do trilho. Mostra o job que está ANDANDO; sem
 * nenhum ativo, o cartão some, porque um anel parado em 0% ocuparia espaço
 * para dizer "nada acontecendo", e o silêncio já diz isso.
 *
 * Exceção: estando NA tela da Fila, o cartão fica em estado quieto, para a
 * rota ter representação no trilho.
 *
 * D-897: o lote de publicação conta. Sozinho, o cartão fala dele; com jobs
 * rodando, os jobs mandam no anel e o lote aparece no título.
 */
export function filaDoTrilho(
  jobs: QueueJob[],
  naFila: boolean,
  onAbrir?: () => void,
  lote: ResumoDoLote | null = null,
): FilaDoTrilho | undefined {
  const ativos = jobs.filter((j) => j.estado === 'rodando' || j.estado === 'aguardando');
  const comLote = lotePedeAtencao(lote);
  if (ativos.length === 0 && comLote) {
    return { titulo: 'Fila · lote', sub: textoDoLote(lote), progresso: lote.progresso, onAbrir };
  }
  if (ativos.length === 0) {
    return naFila
      ? { titulo: 'Fila', sub: jobs.length > 0 ? 'nada rodando' : 'vazia', progresso: 0, to: '/fila' }
      : undefined;
  }
  const rodando = ativos.find((j) => j.estado === 'rodando') ?? ativos[0];
  return {
    titulo: `Fila · ${ativos.length} job${ativos.length === 1 ? '' : 's'}${comLote ? ' + lote' : ''}`,
    sub: `${rodando.rotuloTipo} ${Math.round(rodando.progresso)}%`,
    progresso: rodando.progresso,
    onAbrir,
  };
}
