import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────
// Fila global de jobs de render (DE-PARA §0). O registro é
// client-side: quem dispara um render (pós-produção, dropzone)
// registra o job aqui; cada item acompanha o corte via
// usePipelineStatus (poll). Persistido em `workbench-queue-v1`
// para sobreviver a reload durante renders longos.
// ─────────────────────────────────────────────────────────────

export interface QueueJob {
  corteId: string;
  projetoId: string;
  /** Rótulo humano do job (ex.: "265 · corte 07 → render"). */
  rotulo: string;
}

export const QUEUE_STORAGE_KEY = 'workbench-queue-v1';

export function serializeQueue(jobs: QueueJob[]): string {
  return JSON.stringify(jobs);
}

export function parseStoredQueue(raw: string | null): QueueJob[] | null {
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
    const candidate = item as { corteId?: unknown; projetoId?: unknown; rotulo?: unknown };
    if (typeof candidate.corteId !== 'string' || candidate.corteId.length === 0) continue;
    if (typeof candidate.projetoId !== 'string' || candidate.projetoId.length === 0) continue;
    jobs.push({
      corteId: candidate.corteId,
      projetoId: candidate.projetoId,
      rotulo: typeof candidate.rotulo === 'string' ? candidate.rotulo : candidate.corteId,
    });
  }
  return jobs;
}

interface WorkbenchQueueContextValue {
  jobs: QueueJob[];
  /** Registra (ou re-registra) o acompanhamento de um corte em render. */
  registerJob: (job: QueueJob) => void;
  removeJob: (corteId: string) => void;
}

const WorkbenchQueueContext = createContext<WorkbenchQueueContextValue | null>(null);

function readStoredQueue(): QueueJob[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseStoredQueue(window.localStorage.getItem(QUEUE_STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

export function WorkbenchQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<QueueJob[]>(() => readStoredQueue());

  useEffect(() => {
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, serializeQueue(jobs));
    } catch {
      // ignora — fila volta vazia no próximo load
    }
  }, [jobs]);

  const registerJob = useCallback((job: QueueJob) => {
    setJobs((prev) => [...prev.filter((j) => j.corteId !== job.corteId), job]);
  }, []);

  const removeJob = useCallback((corteId: string) => {
    setJobs((prev) => prev.filter((j) => j.corteId !== corteId));
  }, []);

  const value = useMemo(() => ({ jobs, registerJob, removeJob }), [jobs, registerJob, removeJob]);

  return <WorkbenchQueueContext.Provider value={value}>{children}</WorkbenchQueueContext.Provider>;
}

export function useWorkbenchQueue(): WorkbenchQueueContextValue {
  const context = useContext(WorkbenchQueueContext);
  if (!context) {
    throw new Error('useWorkbenchQueue must be used inside WorkbenchQueueProvider');
  }
  return context;
}
