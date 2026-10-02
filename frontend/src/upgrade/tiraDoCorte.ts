import { buildStatusPills } from '@/features/projeto-detalhe/StatusPills';
import type { StatusExportCorte } from '@/types/models';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · a tira que volta a dizer algo.
//
// A queixa: "não dá por ela saber o status das coisas".
//
// ATENÇÃO — leia antes de mexer. A casca nova chamava `buildStatusPills`
// cru e desenhava um laço de DOIS tons (`p.done ? --ok : --dim`), perdendo
// o "parou aqui" que a tira antiga (`StatusPipStrip`, estilada em `--wb-*`
// e removida na D-862 por não ter mais tela) já sabia mostrar.
//
// Por isso AQUI mora a REGRA (estado de cada etapa, agrupamento,
// "próxima"), pura, sem uma linha de estilo; a tira da casca (.ap) é só a
// roupa. Copiar a regra para dentro de um componente foi o que fez as duas
// tiras divergirem.
//
// A fonte dos booleanos continua sendo `buildStatusPills`: ela já sabe
// ler `StatusExportCorte` e já carrega rótulo e `hint` de cada etapa.
// Reescrever essas leituras aqui criaria duas verdades sobre o mesmo
// corte — exatamente o defeito que esta rodada está consertando.
// ─────────────────────────────────────────────────────────────────

export type EstadoDoPip = 'feito' | 'agora' | 'rejeitado' | 'falta';

export type GrupoDaTira = 'CENAS' | 'RENDER' | 'PUBLICAÇÃO';

export type Pip = {
  /** Sigla de 3 letras: ícone de 11px sem texto não se lê. */
  sigla: string;
  /** Rótulo humano, vindo de `buildStatusPills` ("Bruto", "Graded"…). */
  nome: string;
  /** O `hint` de `buildStatusPills`, sem reescrita. */
  descricao: string;
  grupo: GrupoDaTira;
  estado: EstadoDoPip;
};

/**
 * Sigla e grupo por RÓTULO — o rótulo é a chave estável entre os dois
 * lados. Casar por índice quebraria em silêncio no dia em que alguém
 * inserir uma etapa no meio de `buildStatusPills`.
 */
const POR_ROTULO: Record<string, { sigla: string; grupo: GrupoDaTira }> = {
  Bruto: { sigla: 'BRU', grupo: 'CENAS' },
  Cenas: { sigla: 'CEN', grupo: 'CENAS' },
  Graded: { sigla: 'GRD', grupo: 'RENDER' },
  Overlays: { sigla: 'OVL', grupo: 'RENDER' },
  Final: { sigla: 'FIN', grupo: 'RENDER' },
  Thumb: { sigla: 'THU', grupo: 'PUBLICAÇÃO' },
  Meta: { sigla: 'MET', grupo: 'PUBLICAÇÃO' },
  YouTube: { sigla: 'YT', grupo: 'PUBLICAÇÃO' },
};

export type Tira = {
  grupos: { nome: GrupoDaTira; pips: Pip[] }[];
  feitas: number;
  total: number;
  /** "3/8" — o contador ao lado da tira. */
  contagem: string;
  /** A etapa pendente mais antiga. É o "e agora?" — undefined = 8/8. */
  proxima?: Pip;
};

/**
 * Monta a tira de um corte.
 *
 * `statusCorte` é o status EDITORIAL (`corte.status`): 'rejeitado' pinta
 * o primeiro pip e apaga o resto — um corte fora do lote não tem
 * "próxima etapa".
 */
export function montarTira(status: StatusExportCorte, statusCorte?: string): Tira {
  const rejeitado = statusCorte === 'rejeitado';

  // A ordem é a de `buildStatusPills` — a do fluxo, com Thumb e Meta antes
  // do YouTube (D-746). Uma ordem só para as duas cascas.
  const ordenados = buildStatusPills(status).map((p) => {
    const meta = POR_ROTULO[p.label];
    // Etapa nova em `buildStatusPills` sem entrada aqui não pode derrubar
    // a tira: ela entra em PUBLICAÇÃO com as 3 primeiras letras do rótulo.
    return {
      nome: p.label,
      done: p.done,
      descricao: p.hint,
      sigla: meta?.sigla ?? p.label.slice(0, 3).toUpperCase(),
      grupo: meta?.grupo ?? ('PUBLICAÇÃO' as GrupoDaTira),
    };
  });

  // Corte no ar não tem "próxima etapa": a limpeza apaga os arquivos
  // intermediários (grade, final) e um corte pode subir sem cenas Remotion.
  // Sem esta guarda, a tira mandava fazer cenas de um vídeo já publicado.
  const noAr = ordenados.some((p) => p.nome === 'YouTube' && p.done);
  const iProxima = rejeitado || noAr ? -1 : ordenados.findIndex((p) => !p.done);

  const pips: Pip[] = ordenados.map((p, i) => ({
    sigla: p.sigla,
    nome: p.nome,
    descricao: p.descricao,
    grupo: p.grupo,
    estado: rejeitado
      ? i === 0
        ? 'rejeitado'
        : 'falta'
      : p.done
        ? 'feito'
        : i === iProxima
          ? 'agora'
          : 'falta',
  }));

  const grupos: { nome: GrupoDaTira; pips: Pip[] }[] = [];
  for (const pip of pips) {
    const g = grupos.find((x) => x.nome === pip.grupo);
    if (g) g.pips.push(pip);
    else grupos.push({ nome: pip.grupo, pips: [pip] });
  }

  const feitas = pips.filter((p) => p.estado === 'feito').length;
  return {
    grupos,
    feitas,
    total: pips.length,
    contagem: `${feitas}/${pips.length}`,
    proxima: iProxima >= 0 ? pips[iProxima] : undefined,
  };
}

/** O `title` de um pip. Estado ANTES da descrição: é o que se procura. */
export function dicaDoPip(p: Pip): string {
  const estado =
    p.estado === 'feito'
      ? 'feito'
      : p.estado === 'agora'
        ? 'é aqui que parou'
        : p.estado === 'rejeitado'
          ? 'corte rejeitado'
          : 'pendente';
  return `${p.nome} — ${estado}${p.descricao ? ' · ' + p.descricao : ''}`;
}

/** "próximo: overlays" — o rótulo à direita da tira. */
export function textoDaProxima(t: Tira): string {
  if (t.proxima) return `próximo: ${t.proxima.nome.toLowerCase()}`;
  const noAr = t.grupos.some((g) => g.pips.some((p) => p.nome === 'YouTube' && p.estado === 'feito'));
  return noAr ? 'no ar' : 'nada pendente';
}
