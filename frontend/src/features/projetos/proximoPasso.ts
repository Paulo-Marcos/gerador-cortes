import { sortProjetosPorPublicacao } from '@/features/projetos/bibliotecaFiltros';
import { estaProntoPraYoutube } from '@/features/projetos/useProjetos';
import type { Projeto } from '@/types/models';

// ─────────────────────────────────────────────────────────────────
// D-1148 (E-069 H-15; DIRECAO §5 e §7.1) · O cartão "Continue de onde parou".
//
// A Biblioteca tem UMA primária, e ela não é "Nova live": é o próximo passo da
// live em que o operador mexeu por último. Duas perguntas, duas funções:
//
// - QUAL live: a mais recente do histórico da casca (`historicoDaCasca`, o
//   mesmo "Onde eu estava" do ⌘K) que ainda tem trabalho. Live toda no ar não
//   pede nada, então não vira destaque. Sem histórico (navegador novo), vale a
//   mais recente das que não foram publicadas.
// - QUE passo: o primeiro buraco na ordem do fluxo (RN do ciclo da live:
//   baixar → analisar → aprovar → renderizar → metadados → publicar), lido das
//   contagens que a listagem já traz. Nenhuma busca a mais.
// ─────────────────────────────────────────────────────────────────

export type ProximoPasso = { texto: string; to: string };

const cortes = (n: number) => `${n} ${n === 1 ? 'corte' : 'cortes'}`;

/** O id da live numa rota do histórico (`/projetos/<id>/...`). */
function idDaRota(to: string): string | null {
  return /^\/projetos\/([^/?#]+)/.exec(to)?.[1] ?? null;
}

/** A live do "Continue": a última em que mexeu e que ainda tem trabalho. */
export function liveDoDestaque(projetos: Projeto[], lugares: Array<{ to: string }>): Projeto | undefined {
  if (projetos.length === 0) return undefined;
  const porId = new Map(projetos.map((p) => [p.id, p]));
  for (const lugar of lugares) {
    const id = idDaRota(lugar.to);
    const projeto = id ? porId.get(id) : undefined;
    if (projeto && !estaProntoPraYoutube(projeto)) return projeto;
  }
  const recentes = projetos.slice().sort(sortProjetosPorPublicacao);
  return recentes.find((p) => !estaProntoPraYoutube(p)) ?? recentes[0];
}

/** O próximo passo da live, no verbo do operador e com o destino na casca. */
export function proximoPasso(p: Projeto): ProximoPasso {
  const live = `/projetos/${p.id}`;
  if (p.status === 'erro') return { texto: 'Ver o que falhou', to: live };
  if (p.status === 'pendente' || p.status === 'baixando') return { texto: 'Acompanhar o download', to: live };
  if (p.status === 'transcrevendo') return { texto: 'Acompanhar a transcrição', to: live };
  if (p.status === 'pronto' || p.status === 'analisando') return { texto: 'Acompanhar a análise', to: live };

  // Daqui para baixo a live está analisada: as contagens dizem onde ela parou.
  if (p.total_cortes === 0) return { texto: 'Propor os cortes', to: `${live}/cortes` };
  // Toda no ar não pede mais nada: as contagens de render e metadados podem estar
  // atrás (mídia limpa, metadados escritos no YouTube) sem que falte trabalho.
  if (estaProntoPraYoutube(p)) return { texto: 'Ver os cortes no ar', to: `${live}/cortes` };
  const aprovados = p.total_aprovados;
  if (aprovados === 0) return { texto: `Revisar ${cortes(p.total_cortes)}`, to: `${live}/cortes` };
  if (p.total_video_pronto < aprovados) {
    return { texto: `Renderizar ${cortes(aprovados - p.total_video_pronto)}`, to: `${live}/post-production` };
  }
  if (p.total_com_meta < aprovados) {
    return { texto: `Escrever os metadados de ${cortes(aprovados - p.total_com_meta)}`, to: `${live}/metadados` };
  }
  const faltam = aprovados - p.total_publicados;
  if (faltam > 0) return { texto: `Publicar ${cortes(faltam)}`, to: `${live}/final-review` };
  return { texto: 'Ver os cortes no ar', to: `${live}/cortes` };
}
