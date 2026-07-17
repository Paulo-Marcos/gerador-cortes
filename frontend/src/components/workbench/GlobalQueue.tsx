import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePipelineStatus } from '@/hooks/useEditor';
import { PanelShell } from './PanelShell';
import { useWorkbenchQueue, type QueueJob } from './useWorkbenchQueue';
import { tabPath } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// GlobalQueue — fila global de jobs de render (DE-PARA §0),
// visível em qualquer tela. Cada job acompanha o corte via
// usePipelineStatus (poll 2s enquanto running). Item concluído
// tem "abrir na aba"; a dropzone recebe cortes arrastados
// ("renderizar em 2º plano" liga o drop na etapa da pós).
// ─────────────────────────────────────────────────────────────

function QueueJobItem({ job }: { job: QueueJob }) {
  const navigate = useNavigate();
  const { removeJob } = useWorkbenchQueue();
  const status = usePipelineStatus(job.corteId, true);

  const state = status.data?.state ?? 'idle';
  const progress = Math.max(0, Math.min(100, Math.round(status.data?.progress ?? 0)));
  const stage = status.data?.stage;

  if (state === 'done') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-ok-soft)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[10.5px] font-bold text-[var(--wb-ok)]">{job.rotulo} ✓ pronto</span>
          <button
            type="button"
            aria-label={`Remover ${job.rotulo} da fila`}
            onClick={() => removeJob(job.corteId)}
            className="text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
          >
            <X size={11} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={() =>
            navigate(tabPath({ projetoId: job.projetoId, etapa: 'revisao', corteId: job.corteId }))
          }
          className="mt-1 text-[10px] font-semibold text-[var(--wb-ok)] underline"
        >
          abrir na aba Revisão →
        </button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-err-soft)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[10.5px] font-bold text-[var(--wb-err)]">{job.rotulo}</span>
          <button
            type="button"
            aria-label={`Remover ${job.rotulo} da fila`}
            onClick={() => removeJob(job.corteId)}
            className="text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
          >
            <X size={11} aria-hidden />
          </button>
        </div>
        <div className="mt-1 break-words text-[9.5px] text-[var(--wb-err)]">
          {status.data?.error ?? 'falha no render'}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[9px] bg-[var(--wb-warn-soft)] p-2.5">
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10.5px] font-bold">{job.rotulo}</span>
        <button
          type="button"
          aria-label={`Remover ${job.rotulo} da fila`}
          onClick={() => removeJob(job.corteId)}
          className="text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
        >
          <X size={11} aria-hidden />
        </button>
      </div>
      <div className="my-1.5 h-1 rounded-sm bg-[var(--wb-bg-inset)]">
        <div
          className="h-full rounded-sm bg-[var(--wb-warn)] transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="font-code text-[9px] font-semibold text-[var(--wb-warn)]">
        {progress}%{stage ? ` · ${stage}` : ''}
      </div>
    </div>
  );
}

/**
 * Anel de progresso da barra colapsada: acompanha o primeiro job da
 * fila (o poll continua mesmo com o painel recolhido).
 */
function CollapsedQueueRing({ job }: { job: QueueJob }) {
  const status = usePipelineStatus(job.corteId, true);
  const progress = Math.max(0, Math.min(100, Math.round(status.data?.progress ?? 0)));
  return (
    <span
      aria-hidden
      className="h-[15px] w-[15px] rounded-full"
      style={{
        background: `conic-gradient(var(--wb-warn) ${progress}%, var(--wb-bg-inset) 0)`,
      }}
    />
  );
}

export function GlobalQueue() {
  const { jobs } = useWorkbenchQueue();

  return (
    <PanelShell
      id="fila"
      side="right"
      title={
        jobs.length > 0 ? `FILA · ${jobs.length} JOB${jobs.length > 1 ? 'S' : ''}` : 'FILA GLOBAL'
      }
      indicator={jobs.length > 0 ? <CollapsedQueueRing job={jobs[0]} /> : undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
        {jobs.map((job) => (
          <QueueJobItem key={job.corteId} job={job} />
        ))}
        <div className="mt-auto rounded-[9px] border border-dashed border-[var(--wb-border)] p-2 text-center text-[10px] font-semibold leading-relaxed text-[var(--wb-text-dim)]">
          arraste um corte aqui para
          <br />
          renderizar em segundo plano
        </div>
      </div>
    </PanelShell>
  );
}
