import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { rotuloCurtoProjeto } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// Fila global de jobs pesados (DE-PARA §0; D-417). O backend é a
// fonte da verdade do que está ATIVO — `/export/fila-global`
// devolve bruto, pós, render final e publicação no YouTube num
// inventário só, então o job aparece aqui independentemente da
// tela que o disparou e sobrevive a reload.
//
// A retenção é do cliente: quando o backend para de publicar um
// job, o último estado conhecido fica congelado na lista. O
// operador pode removê-lo na hora (X), e o que ele não remover
// sai sozinho 1 h depois de terminar (D-425) — sem isso a fila
// virava um histórico e perdia a serventia de mostrar o que está
// acontecendo AGORA. `registerJob` continua existindo para a
// transição otimista no clique, antes do primeiro poll responder.
// ─────────────────────────────────────────────────────────────

/**
 * Tipo do job (`render`, `analise`, `cenas`…). String aberta de propósito: o
 * backend acrescenta tipos conforme novas etapas de IA/render aparecem, e a UI
 * se vira com `familia` (cor) e `rotulo_tipo` (texto) sem precisar conhecê-los.
 */
export type JobTipo = string;
export type JobFamilia = 'ia' | 'midia' | 'publicacao';
export type JobEstado = 'aguardando' | 'rodando' | 'concluido' | 'erro' | 'cancelado';

export interface QueueJob {
  /** `{tipo}:{ref}` — mesma chave que o backend emite. */
  id: string;
  tipo: JobTipo;
  familia: JobFamilia;
  /** Vazio em job de escopo projeto (ingestão, análise da live inteira). */
  corteId: string;
  projetoId: string;
  /** Alvo do trabalho, sem o tipo: "265 · corte 7" ou "265". Agrupa a fila. */
  alvo: string;
  /** Nome do tipo em português vindo do backend ("render", "capa", "análise"). */
  rotuloTipo: string;
  /** Rótulo humano do job (ex.: "265 · corte 7 → render", "265 → análise"). */
  rotulo: string;
  estado: JobEstado;
  progresso: number;
  etapa: string;
  erro: string;
  /**
   * Quando o job foi visto pela primeira vez num estado terminal (epoch ms).
   * É o relógio da expiração de 1 h — o backend não serve para isso porque a
   * fila também guarda job que ele já parou de publicar.
   */
  terminalDesde: number | null;
}

/** Quanto tempo um job terminado continua visível antes de sumir (D-425). */
export const EXPIRACAO_TERMINAL_MS = 60 * 60 * 1000;

/** Item cru de `/export/fila-global`. Tipado aqui porque a fila é o único consumidor. */
interface JobRemoto {
  id: string;
  tipo: JobTipo;
  familia: JobFamilia;
  rotulo_tipo: string;
  corte_id: string;
  projeto_id: string;
  /** null quando o job é do projeto inteiro, não de um corte. */
  corte_numero: number | null;
  projeto_titulo: string;
  estado: JobEstado;
  progresso: number;
  etapa: string;
  erro: string;
}

export const QUEUE_STORAGE_KEY = 'workbench-queue-v2';
const QUEUE_STORAGE_KEY_V1 = 'workbench-queue-v1';

export function ehAtivo(estado: JobEstado): boolean {
  return estado === 'aguardando' || estado === 'rodando';
}

export function jobDeRemoto(remoto: JobRemoto): QueueJob {
  const projeto = rotuloCurtoProjeto(remoto.projeto_titulo);
  const alvo = remoto.corte_numero != null ? `${projeto} · corte ${remoto.corte_numero}` : projeto;
  return {
    id: remoto.id,
    tipo: remoto.tipo,
    familia: remoto.familia,
    corteId: remoto.corte_id,
    projetoId: remoto.projeto_id,
    alvo,
    rotuloTipo: remoto.rotulo_tipo,
    rotulo: `${alvo} → ${remoto.rotulo_tipo}`,
    estado: remoto.estado,
    progresso: remoto.progresso,
    etapa: remoto.etapa,
    erro: remoto.erro,
    terminalDesde: null,
  };
}

/**
 * Chave de agrupamento: tudo que pertence ao mesmo corte (ou ao mesmo projeto,
 * quando o job não tem corte) cai numa linha só. Sem isso, disparar bruto +
 * capa + metadados de um corte enchia a fila com três linhas quase idênticas.
 */
export function chaveDoGrupo(job: QueueJob): string {
  return job.corteId || job.projetoId || job.id;
}

export interface EstadoFila {
  jobs: QueueJob[];
  /** Ids que o operador removeu — o backend pode continuar publicando por ~1 h. */
  dispensados: string[];
}

const FILA_VAZIA: EstadoFila = { jobs: [], dispensados: [] };

/** Ativos primeiro; `sort` estável preserva a ordem de chegada dentro de cada grupo. */
function ordenar(jobs: QueueJob[]): QueueJob[] {
  return [...jobs].sort((a, b) => Number(ehAtivo(b.estado)) - Number(ehAtivo(a.estado)));
}

function assinatura(estado: EstadoFila): string {
  return JSON.stringify(estado);
}

/**
 * Carimba o instante em que o job virou terminal, preservando o carimbo já
 * existente. É o carimbo que decide a expiração — se ele fosse renovado a cada
 * poll, o job concluído nunca completaria a hora e jamais sairia da fila.
 */
function carimbarTerminal(job: QueueJob, anterior: QueueJob | undefined, agora: number): QueueJob {
  // O job vem de `jobDeRemoto`, que nasce sem carimbo: voltar a rodar já zera o
  // relógio, e é isso que faz um job re-disparado recomeçar a contagem do zero.
  if (ehAtivo(job.estado)) return job;
  const carimbo = anterior && !ehAtivo(anterior.estado) ? anterior.terminalDesde : null;
  return { ...job, terminalDesde: carimbo ?? agora };
}

function expirou(job: QueueJob, agora: number): boolean {
  return job.terminalDesde != null && agora - job.terminalDesde >= EXPIRACAO_TERMINAL_MS;
}

/**
 * Funde o inventário do backend no estado local. Devolve o MESMO objeto quando
 * nada muda — o provider chama isso a cada poll e re-render à toa custa caro
 * com render longo rodando.
 */
export function mesclarFila(
  estado: EstadoFila,
  remotos: JobRemoto[],
  agora: number = Date.now(),
): EstadoFila {
  const vindos = remotos.map(jobDeRemoto);
  const idsRemotos = new Set(vindos.map((job) => job.id));
  const ativosRemotos = new Set(vindos.filter((job) => ehAtivo(job.estado)).map((job) => job.id));

  // Job dispensado que voltou a rodar (mesmo corte, nova execução) reaparece;
  // dispensa de job que o backend nem publica mais pode ser esquecida.
  const dispensados = estado.dispensados.filter(
    (id) => idsRemotos.has(id) && !ativosRemotos.has(id),
  );
  const dispensadosSet = new Set(dispensados);

  const porId = new Map(estado.jobs.map((job) => [job.id, job] as const));
  for (const job of vindos) porId.set(job.id, carimbarTerminal(job, porId.get(job.id), agora));

  const proximo: EstadoFila = {
    jobs: ordenar(
      [...porId.values()].filter(
        (job) => !dispensadosSet.has(job.id) && !expirou(job, agora),
      ),
    ),
    dispensados,
  };
  return assinatura(proximo) === assinatura(estado) ? estado : proximo;
}

export function serializeQueue(estado: EstadoFila): string {
  return JSON.stringify(estado);
}

function parseJob(item: unknown): QueueJob | null {
  if (typeof item !== 'object' || item === null) return null;
  const candidato = item as Partial<QueueJob>;
  // O `id` é a única chave obrigatória: job de escopo projeto (ingestão,
  // análise da live) tem `corteId` vazio e, exigindo-o aqui, sumiria da fila no
  // primeiro reload depois que o backend parasse de publicá-lo.
  if (typeof candidato.id !== 'string' || candidato.id.length === 0) return null;
  const rotulo = typeof candidato.rotulo === 'string' ? candidato.rotulo : candidato.id;
  const estado = (candidato.estado ?? 'rodando') as JobEstado;
  return {
    id: candidato.id,
    tipo: (candidato.tipo ?? 'render') as JobTipo,
    familia: (candidato.familia ?? 'midia') as JobFamilia,
    corteId: typeof candidato.corteId === 'string' ? candidato.corteId : '',
    projetoId: typeof candidato.projetoId === 'string' ? candidato.projetoId : '',
    // Fila salva antes do D-425 não tem `alvo`/`rotuloTipo`: o rótulo inteiro
    // vira o alvo, o que só custa um agrupamento menos preciso até o próximo poll.
    alvo: typeof candidato.alvo === 'string' ? candidato.alvo : rotulo,
    rotuloTipo: typeof candidato.rotuloTipo === 'string' ? candidato.rotuloTipo : '',
    rotulo,
    estado,
    progresso: typeof candidato.progresso === 'number' ? candidato.progresso : 0,
    etapa: typeof candidato.etapa === 'string' ? candidato.etapa : '',
    erro: typeof candidato.erro === 'string' ? candidato.erro : '',
    // Job terminal salvo sem carimbo (fila anterior ao D-425) ficaria para
    // sempre: dar-lhe o carimbo de agora faz a hora contar a partir do reload.
    terminalDesde:
      typeof candidato.terminalDesde === 'number'
        ? candidato.terminalDesde
        : ehAtivo(estado)
          ? null
          : Date.now(),
  };
}

export function parseStoredQueue(raw: string | null): EstadoFila | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { jobs, dispensados } = data as { jobs?: unknown; dispensados?: unknown };
  if (!Array.isArray(jobs)) return null;
  return {
    jobs: jobs.map(parseJob).filter((job): job is QueueJob => job !== null),
    dispensados: Array.isArray(dispensados) ? dispensados.filter((id) => typeof id === 'string') : [],
  };
}

/** Migração da fila v1 (só render, sem estado): vira job de render rodando. */
export function migrarFilaV1(raw: string | null): EstadoFila | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const jobs: QueueJob[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const { corteId, projetoId, rotulo } = item as Record<string, unknown>;
    if (typeof corteId !== 'string' || corteId.length === 0) continue;
    const texto = typeof rotulo === 'string' ? rotulo : corteId;
    jobs.push({
      id: `render:${corteId}`,
      tipo: 'render',
      familia: 'midia',
      corteId,
      projetoId: typeof projetoId === 'string' ? projetoId : '',
      alvo: texto,
      rotuloTipo: 'render',
      rotulo: texto,
      estado: 'rodando',
      progresso: 0,
      etapa: 'Render final',
      erro: '',
      terminalDesde: null,
    });
  }
  return { jobs, dispensados: [] };
}

/** Registro otimista disparado no clique, antes do backend publicar o job. */
export interface RegistroJob {
  corteId: string;
  projetoId: string;
  rotulo: string;
}

/**
 * Uma linha da fila: todos os jobs do mesmo alvo (corte, ou projeto quando o
 * job não tem corte). O detalhe de cada execução fica atrás do clique.
 */
export interface GrupoFila {
  chave: string;
  /** "265 · corte 7" — o alvo, sem os tipos. */
  rotulo: string;
  jobs: QueueJob[];
  /** Estado que representa o grupo (ver `PRIORIDADE_ESTADO`). */
  estado: JobEstado;
  /** Job que dá progresso/etapa à linha colapsada. */
  destaque: QueueJob;
}

// Qual estado "ganha" o rótulo do grupo. Erro na frente de tudo: um lote em que
// uma peça falhou não pode se anunciar como concluído. Depois vem o que ainda
// está acontecendo; cancelado fica por último, abaixo até de concluído, porque
// é o desfecho que menos pede atenção.
const PRIORIDADE_ESTADO: JobEstado[] = ['erro', 'rodando', 'aguardando', 'concluido', 'cancelado'];

export function agruparFila(jobs: QueueJob[]): GrupoFila[] {
  const grupos = new Map<string, QueueJob[]>();
  for (const job of jobs) {
    const chave = chaveDoGrupo(job);
    const atual = grupos.get(chave);
    if (atual) atual.push(job);
    else grupos.set(chave, [job]);
  }

  return [...grupos.entries()].map(([chave, doGrupo]) => {
    const estado =
      PRIORIDADE_ESTADO.find((candidato) => doGrupo.some((job) => job.estado === candidato)) ??
      doGrupo[0].estado;
    const destaque = doGrupo.find((job) => job.estado === estado) ?? doGrupo[0];
    return { chave, rotulo: destaque.alvo, jobs: doGrupo, estado, destaque };
  });
}

interface WorkbenchQueueContextValue {
  jobs: QueueJob[];
  /** A fila como a UI desenha: uma linha por alvo (D-425). */
  grupos: GrupoFila[];
  /** Registra (ou re-registra) o acompanhamento de um render recém-disparado. */
  registerJob: (job: RegistroJob) => void;
  removeJob: (id: string) => void;
  /** D-426: pede ao backend que interrompa o job. Rejeita com a mensagem da API. */
  cancelJob: (id: string) => Promise<void>;
  clearAll: () => void;
}

const WorkbenchQueueContext = createContext<WorkbenchQueueContextValue | null>(null);

function readStoredQueue(): EstadoFila {
  if (typeof window === 'undefined') return FILA_VAZIA;
  try {
    const atual = parseStoredQueue(window.localStorage.getItem(QUEUE_STORAGE_KEY));
    if (atual) return atual;
    return migrarFilaV1(window.localStorage.getItem(QUEUE_STORAGE_KEY_V1)) ?? FILA_VAZIA;
  } catch {
    return FILA_VAZIA;
  }
}

const POLL_ATIVO_MS = 2_000;
const POLL_OCIOSO_MS = 5_000;

export function WorkbenchQueueProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoFila>(() => readStoredQueue());

  const temAtivo = estado.jobs.some((job) => ehAtivo(job.estado));
  const filaGlobal = useQuery({
    queryKey: ['workbench', 'fila-global'],
    // O contrato estendido (`jobs`) só é consumido aqui — daí o cast local.
    queryFn: async () => (await api.filaGlobal()) as unknown as { jobs?: JobRemoto[] },
    refetchInterval: temAtivo ? POLL_ATIVO_MS : POLL_OCIOSO_MS,
  });

  const remotos = filaGlobal.data?.jobs;
  const atualizadoEm = filaGlobal.dataUpdatedAt;
  useEffect(() => {
    if (!remotos) return;
    setEstado((anterior) => mesclarFila(anterior, remotos));
    // `atualizadoEm` entra de propósito: o structural sharing do react-query
    // preserva a referência de `jobs` entre polls idênticos, e sem ele a
    // limpeza das dispensas só rodaria quando a lista remota mudasse.
  }, [remotos, atualizadoEm]);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, serializeQueue(estado));
    } catch {
      // ignora — fila volta vazia no próximo load
    }
  }, [estado]);

  const registerJob = useCallback((registro: RegistroJob) => {
    const id = `render:${registro.corteId}`;
    const job: QueueJob = {
      id,
      tipo: 'render',
      familia: 'midia',
      corteId: registro.corteId,
      projetoId: registro.projetoId,
      // O alvo real chega no primeiro poll; até lá o rótulo otimista serve.
      alvo: registro.rotulo,
      rotuloTipo: 'render',
      rotulo: registro.rotulo,
      estado: 'rodando',
      progresso: 0,
      etapa: 'Iniciando render final',
      erro: '',
      terminalDesde: null,
    };
    setEstado((anterior) => ({
      jobs: ordenar([...anterior.jobs.filter((j) => j.id !== id), job]),
      dispensados: anterior.dispensados.filter((dispensado) => dispensado !== id),
    }));
  }, []);

  const removeJob = useCallback((id: string) => {
    setEstado((anterior) => ({
      jobs: anterior.jobs.filter((job) => job.id !== id),
      dispensados: anterior.dispensados.includes(id)
        ? anterior.dispensados
        : [...anterior.dispensados, id],
    }));
  }, []);

  const cancelJob = useCallback(
    async (id: string) => {
      // Marca otimista: o backend leva alguns segundos para os processos
      // morrerem e o poll refletir o novo estado. Sem isso, o operador clica em
      // cancelar e a linha segue dizendo "rodando" — e ele clica de novo.
      setEstado((anterior) => ({
        ...anterior,
        jobs: anterior.jobs.map((job) =>
          job.id === id ? { ...job, estado: 'cancelado', etapa: 'Cancelando…' } : job,
        ),
      }));
      await api.cancelarJob(id);
      await filaGlobal.refetch();
    },
    [filaGlobal],
  );

  const clearAll = useCallback(() => {
    setEstado((anterior) => ({
      jobs: [],
      dispensados: [...new Set([...anterior.dispensados, ...anterior.jobs.map((job) => job.id)])],
    }));
  }, []);

  const grupos = useMemo(() => agruparFila(estado.jobs), [estado.jobs]);

  const value = useMemo(
    () => ({ jobs: estado.jobs, grupos, registerJob, removeJob, cancelJob, clearAll }),
    [estado.jobs, grupos, registerJob, removeJob, cancelJob, clearAll],
  );

  return <WorkbenchQueueContext.Provider value={value}>{children}</WorkbenchQueueContext.Provider>;
}

export function useWorkbenchQueue(): WorkbenchQueueContextValue {
  const context = useContext(WorkbenchQueueContext);
  if (!context) {
    throw new Error('useWorkbenchQueue must be used inside WorkbenchQueueProvider');
  }
  return context;
}

/**
 * Variante nula-segura para telas que existem nos DOIS shells: no shell
 * legado (sem provider) devolve null e o chamador simplesmente não
 * registra o job na fila.
 */
export function useWorkbenchQueueOptional(): WorkbenchQueueContextValue | null {
  return useContext(WorkbenchQueueContext);
}
