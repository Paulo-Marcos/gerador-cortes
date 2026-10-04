import { estaAprovado } from '@/lib/statusDoCorte';
import type { StatusCorte, StatusExportCorte } from '@/types/models';
import { TELAS, type TelaId } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-866 · A trilha da live.
//
// Uma live tinha três réguas de etapas com nomes diferentes: a fita da
// casca (Workspace · Cortes · Pós · Metadados · Revisão), o bloco "Etapas
// da live" do Workspace (Baixado · Analisado · … · Publicado) e os quatro
// cartões de números. A trilha é uma só, nas telas de dentro da live, e
// responde as duas perguntas no mesmo lugar: onde estou (a casa acesa) e
// quanto andou (o ✓ e a contagem de cada etapa).
//
// Baixado, Analisado e Publicado não têm tela própria: levam ao Workspace,
// e Publicado com o filtro "No ar" (decisão do Paulo, Onda 3).
// ─────────────────────────────────────────────────────────────────

export type EtapaId =
  | 'baixado'
  | 'analisado'
  | 'cortes'
  | 'pos'
  | 'metadados'
  | 'revisao'
  | 'publicado';

export type EtapaDaTrilha = {
  id: EtapaId;
  texto: string;
  /** "3 de 5", "6 propostos", "ok" — ou "—" sem dados ou sem aprovados. */
  contagem: string;
  feita: boolean;
  /** A casa acesa: a tela aberta ou, no Workspace, onde a live parou. */
  agora: boolean;
  to: string;
};

/** O que a trilha lê da live: o projeto, os cortes e o export de cada um. */
export type DadosDaLive = {
  statusDoProjeto: string | undefined;
  arquivosLimpos: boolean;
  cortes: Array<{ id: string; status: StatusCorte }>;
  exportados: Array<
    Pick<
      StatusExportCorte,
      'corte_id' | 'video_pronto' | 'metadados_completos' | 'pronto_publicar' | 'youtube_url_publicado'
    >
  >;
};

/**
 * Os dados da trilha a partir das três queries da live. Sem projeto ou sem
 * cortes ainda não há o que contar (a trilha mostra as casas sem contagem);
 * export ausente é live sem render nenhum, não "carregando".
 */
export function dadosDaLive(
  projeto: { status?: string | null; arquivos_limpos?: boolean | null } | undefined,
  cortes: DadosDaLive['cortes'] | undefined,
  exportados: DadosDaLive['exportados'] | undefined,
): DadosDaLive | undefined {
  if (!projeto || !cortes) return undefined;
  return {
    statusDoProjeto: projeto.status ?? undefined,
    arquivosLimpos: Boolean(projeto.arquivos_limpos),
    cortes,
    exportados: exportados ?? [],
  };
}

/** O filtro do Workspace a que a etapa Publicado leva. */
export const FILTRO_NO_AR = 'no-ar';

/** A URL pede o filtro "No ar"? Uma leitura só, para a trilha (que acende
 *  Publicado) e o Workspace (que filtra a lista) não discordarem. */
export function filtroNoArLigado(search: string): boolean {
  return new URLSearchParams(search).get('filtro') === FILTRO_NO_AR;
}

const TELAS_DA_LIVE: TelaId[] = ['projeto', 'cortes', 'pos', 'metadados', 'revisao'];

/** As telas que pertencem a uma live — e portanto mostram a trilha. */
export function dentroDeUmaLive(tela: TelaId): boolean {
  return TELAS_DA_LIVE.includes(tela);
}

/**
 * D-798: com um corte aberto, cada etapa de tela leva a ELE — sem isso o
 * menu caía no primeiro corte do projeto.
 */
const ROTA_COM_CORTE: Partial<Record<EtapaId, (projetoId: string, corteId: string) => string>> = {
  cortes: (p, c) => `/projetos/${p}/cortes/${c}`,
  pos: (p, c) => `/projetos/${p}/post-production?corte=${c}`,
  metadados: (p, c) => `/projetos/${p}/metadados?corte=${c}`,
  revisao: (p, c) => `/projetos/${p}/final-review?corte=${c}`,
};

const TELA_DA_ETAPA: Partial<Record<EtapaId, TelaId>> = {
  cortes: 'cortes',
  pos: 'pos',
  metadados: 'metadados',
  revisao: 'revisao',
};

const STATUS_JA_BAIXADO = new Set(['transcrevendo', 'pronto', 'analisando', 'analisado']);

type Passo = Omit<EtapaDaTrilha, 'agora' | 'to'>;

/** "n de m" sobre os aprovados; sem aprovados, a etapa ainda não começou. */
function sobreAprovados(
  id: EtapaId,
  texto: string,
  feitos: number,
  aprovados: number,
  sufixo = '',
): Passo {
  return {
    id,
    texto,
    contagem: aprovados > 0 ? `${feitos} de ${aprovados}${sufixo}` : '—',
    feita: aprovados > 0 && feitos === aprovados,
  };
}

function passosDaLive(dados: DadosDaLive): Passo[] {
  const total = dados.cortes.length;
  const vivos = dados.cortes.filter((c) => c.status !== 'rejeitado');
  const aprovadosIds = new Set(vivos.filter((c) => estaAprovado(c.status)).map((c) => c.id));
  const aprovados = aprovadosIds.size;
  const doExport = dados.exportados.filter((e) => aprovadosIds.has(e.corte_id));
  // Corte no ar já passou pelas etapas anteriores: a limpeza (D-598) apaga o
  // vídeo de quem subiu e `video_pronto` volta a falso, mas progresso não
  // anda para trás — sem isto toda live antiga pareceria parada na Pós.
  const quantos = (campo: keyof (typeof doExport)[number]) =>
    doExport.filter((e) => Boolean(e[campo]) || Boolean(e.youtube_url_publicado)).length;
  // Live limpa é live encerrada (decisão do Paulo): o Limpar apaga o vídeo
  // também de quem só subiu no TikTok ou não subiu, então o que vem do disco
  // (vídeo pronto, pronto para publicar) deixa de ser fonte de verdade.
  const doDisco = (campo: 'video_pronto' | 'pronto_publicar') =>
    dados.arquivosLimpos ? aprovados : quantos(campo);

  const baixado = total > 0 || STATUS_JA_BAIXADO.has(dados.statusDoProjeto ?? '');
  const analisado = total > 0 || dados.statusDoProjeto === 'analisado';
  return [
    {
      id: 'baixado',
      texto: 'Baixado',
      contagem: baixado ? (dados.arquivosLimpos ? 'limpo' : 'ok') : '—',
      feita: baixado,
    },
    {
      id: 'analisado',
      texto: 'Analisado',
      contagem: analisado ? `${total} ${total === 1 ? 'proposto' : 'propostos'}` : '—',
      feita: analisado,
    },
    {
      id: 'cortes',
      texto: 'Cortes',
      contagem: vivos.length > 0 ? `${aprovados} de ${vivos.length}` : '—',
      // Feito quando nenhum corte espera decisão e ao menos um foi aprovado.
      feita: aprovados > 0 && vivos.every((c) => c.status !== 'proposto'),
    },
    sobreAprovados('pos', 'Pós', doDisco('video_pronto'), aprovados),
    sobreAprovados('metadados', 'Metadados', quantos('metadados_completos'), aprovados),
    // Revisão feita = o corte está pronto para publicar (vídeo, capa e
    // metadados) — decisão do Paulo, Onda 3.
    sobreAprovados('revisao', 'Revisão', doDisco('pronto_publicar'), aprovados, ' prontos'),
    sobreAprovados('publicado', 'Publicado', quantos('youtube_url_publicado'), aprovados),
  ];
}

const SEM_DADOS: Passo[] = passosDaLive({
  statusDoProjeto: undefined,
  arquivosLimpos: false,
  cortes: [],
  exportados: [],
});

function destino(id: EtapaId, projetoId: string, corteId: string | null): string {
  if (id === 'publicado') return `/projetos/${projetoId}?filtro=${FILTRO_NO_AR}`;
  const tela = TELA_DA_ETAPA[id];
  if (!tela) return `/projetos/${projetoId}`;
  return (corteId && ROTA_COM_CORTE[id]?.(projetoId, corteId)) || TELAS[tela].rota!(projetoId)!;
}

/** Qual casa acende: a da tela aberta; no Workspace, onde a live parou. */
function etapaAcesa(tela: TelaId, passos: Passo[], filtroNoAr: boolean): EtapaId {
  const daTela = (Object.keys(TELA_DA_ETAPA) as EtapaId[]).find((id) => TELA_DA_ETAPA[id] === tela);
  if (daTela) return daTela;
  if (filtroNoAr) return 'publicado';
  return passos.find((p) => !p.feita)?.id ?? 'publicado';
}

/**
 * A trilha da live, na ordem do trabalho. Fora de uma live, vazia.
 * `dados` ausente (ainda carregando) dá as casas sem contagem.
 */
export function trilhaDaLive(
  tela: TelaId,
  projetoId: string | null,
  corteId: string | null = null,
  dados?: DadosDaLive,
  filtroNoAr = false,
): EtapaDaTrilha[] {
  if (!projetoId || !dentroDeUmaLive(tela)) return [];
  const passos = dados ? passosDaLive(dados) : SEM_DADOS;
  const acesa = etapaAcesa(tela, passos, filtroNoAr);
  return passos.map((p) => ({
    ...p,
    agora: p.id === acesa,
    to: destino(p.id, projetoId, corteId),
  }));
}
