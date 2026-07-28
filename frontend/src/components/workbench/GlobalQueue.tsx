import { Ban, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PanelShell } from './PanelShell';
import {
  ehAtivo,
  useWorkbenchQueue,
  type GrupoFila,
  type JobFamilia,
  type QueueJob,
} from './useWorkbenchQueue';
import type { WorkbenchEtapa } from './useWorkbenchTabs';
import { tabPath } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// GlobalQueue — fila global dos jobs pesados (DE-PARA §0;
// D-417), visível em qualquer tela. As quatro operações longas
// (bruto, pós, render final e publicação no YouTube) chegam
// prontas de `/export/fila-global` via useWorkbenchQueue — o
// item só precisa desenhar.
//
// D-425: a fila mostra UMA linha por alvo (corte, ou projeto
// quando o job não tem corte). Disparar bruto + capa + metadados
// do mesmo corte enchia a lista de linhas quase idênticas; agora
// vira uma linha que abre no clique. Job terminado sai sozinho 1 h
// depois; antes disso o operador pode removê-lo (X) ou limpar tudo.
//
// D-426: job ativo e interrompível ganha botão de cancelar, para
// não precisar derrubar a aplicação pelo log.
//
// A dropzone recebe cortes arrastados ("renderizar em 2º plano").
// ─────────────────────────────────────────────────────────────

// Cor por FAMÍLIA, não por tipo: o backend ganha tipos novos a cada etapa de IA
// ou render que passa a ser acompanhada, e o rótulo do item já diz qual é.
const FAMILIA_COR: Record<JobFamilia, string> = {
  ia: 'var(--wb-violet)',
  midia: 'var(--wb-accent)',
  publicacao: 'var(--wb-fire)',
};

/** Aba que mostra o resultado de cada tipo de job. Desconhecido cai no workspace. */
const TIPO_ETAPA: Record<string, WorkbenchEtapa> = {
  ingestao: 'workspace',
  analise: 'workspace',
  bruto: 'cortes',
  trechos: 'cortes',
  cenas: 'pos',
  pos: 'pos',
  render: 'revisao',
  metadados: 'metadados',
  thumbnail: 'metadados',
  youtube: 'revisao',
};

const ETAPA_LABEL: Record<WorkbenchEtapa, string> = {
  workspace: 'Workspace',
  cortes: 'Bruto',
  pos: 'Pós',
  metadados: 'Metadados',
  revisao: 'Revisão',
};

/**
 * Tipos que o backend recusa cancelar (`TIPOS_NAO_CANCELAVEIS`). Abortar um
 * upload no meio deixa vídeo parcial na conta do YouTube — melhor não oferecer
 * um botão que a API vai negar.
 */
const TIPOS_SEM_CANCELAMENTO = new Set(['youtube']);

function podeCancelar(job: QueueJob): boolean {
  return ehAtivo(job.estado) && !TIPOS_SEM_CANCELAMENTO.has(job.tipo);
}

function etapaDoJob(job: QueueJob): WorkbenchEtapa {
  // Job do projeto inteiro (ingestão, análise da live, palco) não tem corte para
  // abrir numa etapa — mandar para a Revisão sem corte cairia numa tela vazia.
  if (!job.corteId) return 'workspace';
  return TIPO_ETAPA[job.tipo] ?? 'workspace';
}

function destinoDoJob(job: QueueJob): string {
  // D-427: `tabPath` já resolve como cada etapa carrega o corte — no path
  // (Bruto) ou em `?corte=` (Pós, Metadados, Revisão).
  return tabPath({
    kind: 'projeto',
    projetoId: job.projetoId,
    etapa: etapaDoJob(job),
    corteId: job.corteId,
  });
}

function BotaoRemover({ rotulo, onRemover }: { rotulo: string; onRemover: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remover ${rotulo} da fila`}
      onClick={onRemover}
      className="text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
    >
      <X size={11} aria-hidden />
    </button>
  );
}

function BotaoCancelar({ job }: { job: QueueJob }) {
  const { cancelJob } = useWorkbenchQueue();
  const [erro, setErro] = useState('');

  return (
    <button
      type="button"
      aria-label={`Cancelar ${job.rotulo}`}
      title={erro || 'Cancelar esta execução'}
      onClick={() => {
        setErro('');
        cancelJob(job.id).catch((falha: unknown) =>
          setErro(falha instanceof Error ? falha.message : 'Falha ao cancelar'),
        );
      }}
      className={erro ? 'text-[var(--wb-err)]' : 'text-[var(--wb-text-dim)] hover:text-[var(--wb-err)]'}
    >
      <Ban size={11} aria-hidden />
    </button>
  );
}

/** Barra + percentual, comum ao job solitário e ao grupo colapsado. */
function BarraProgresso({ job }: { job: QueueJob }) {
  const cor = FAMILIA_COR[job.familia] ?? FAMILIA_COR.midia;
  const progresso = Math.max(0, Math.min(100, Math.round(job.progresso)));
  return (
    <>
      <div className="my-1.5 h-1 rounded-sm bg-[var(--wb-bg-inset)]">
        <div
          className="h-full rounded-sm transition-[width] duration-500"
          style={{ width: `${progresso}%`, background: cor }}
        />
      </div>
      <div className="font-code text-[9px] font-semibold" style={{ color: cor }}>
        {job.estado === 'aguardando' ? 'na fila' : `${progresso}%`}
        {job.etapa ? ` · ${job.etapa}` : ''}
      </div>
    </>
  );
}

function QueueJobItem({ job }: { job: QueueJob }) {
  const { removeJob } = useWorkbenchQueue();
  const cor = FAMILIA_COR[job.familia] ?? FAMILIA_COR.midia;
  const remover = <BotaoRemover rotulo={job.rotulo} onRemover={() => removeJob(job.id)} />;

  if (job.estado === 'concluido') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-ok-soft)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[10.5px] font-bold text-[var(--wb-ok)]">{job.rotulo} ✓ pronto</span>
          {remover}
        </div>
        {/* D-404: link de verdade — Ctrl/⌘+clique abre a etapa em nova aba
            do navegador sem tirar o usuário da tela em que ele está. */}
        <Link
          to={destinoDoJob(job)}
          className="mt-1 block text-[10px] font-semibold text-[var(--wb-ok)] underline"
        >
          abrir na aba {ETAPA_LABEL[etapaDoJob(job)]} →
        </Link>
      </div>
    );
  }

  if (job.estado === 'erro') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-err-soft)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[10.5px] font-bold text-[var(--wb-err)]">{job.rotulo}</span>
          {remover}
        </div>
        <div className="mt-1 break-words text-[9.5px] text-[var(--wb-err)]">
          {job.erro || job.etapa || 'falha no job'}
        </div>
      </div>
    );
  }

  // Cancelado tem visual próprio (neutro, não vermelho): foi decisão do
  // operador, não falha — pintar de erro transformaria cada cancelamento
  // num alarme (D-426).
  if (job.estado === 'cancelado') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <span className="truncate text-[10.5px] font-bold text-[var(--wb-text-dim)]">
            {job.rotulo} · cancelado
          </span>
          {remover}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[9px] bg-[var(--wb-warn-soft)] p-2.5">
      <div className="flex items-start justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="h-[6px] w-[6px] flex-none rounded-full"
            style={{ background: cor }}
          />
          <span className="truncate text-[10.5px] font-bold">{job.rotulo}</span>
        </span>
        <span className="flex flex-none items-center gap-1">
          {podeCancelar(job) ? <BotaoCancelar job={job} /> : null}
          {remover}
        </span>
      </div>
      <BarraProgresso job={job} />
    </div>
  );
}

/**
 * Linha de um alvo com mais de uma execução: resume e abre no clique. O resumo
 * segue o job de destaque (`PRIORIDADE_ESTADO`) — a falha, ou o que ainda roda.
 */
function GrupoItem({ grupo }: { grupo: GrupoFila }) {
  const [aberto, setAberto] = useState(false);
  const { removeJob } = useWorkbenchQueue();
  const { destaque } = grupo;
  const cor = FAMILIA_COR[destaque.familia] ?? FAMILIA_COR.midia;
  const ativos = grupo.jobs.filter((job) => ehAtivo(job.estado)).length;
  const Chevron = aberto ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-[9px] bg-[var(--wb-warn-soft)] p-2.5">
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={() => setAberto((valor) => !valor)}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Chevron size={11} aria-hidden className="flex-none" />
          <span
            aria-hidden
            className="h-[6px] w-[6px] flex-none rounded-full"
            style={{ background: cor }}
          />
          <span className="truncate text-[10.5px] font-bold">{grupo.rotulo}</span>
          <span className="flex-none font-code text-[9px] font-semibold text-[var(--wb-text-dim)]">
            {grupo.jobs.length}×
          </span>
        </button>
        <BotaoRemover
          rotulo={grupo.rotulo}
          onRemover={() => grupo.jobs.forEach((job) => removeJob(job.id))}
        />
      </div>

      {aberto ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {grupo.jobs.map((job) => (
            <QueueJobItem key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <>
          <BarraProgresso job={destaque} />
          <div className="mt-0.5 text-[9px] font-semibold text-[var(--wb-text-dim)]">
            {destaque.rotuloTipo}
            {ativos > 1 ? ` · +${ativos - 1} em andamento` : ''}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Anel de progresso da barra colapsada: acompanha o primeiro job ativo
 * (o poll continua mesmo com o painel recolhido).
 */
function CollapsedQueueRing({ job }: { job: QueueJob }) {
  const progresso = Math.max(0, Math.min(100, Math.round(job.progresso)));
  return (
    <span
      aria-hidden
      className="h-[15px] w-[15px] rounded-full"
      style={{
        background: `conic-gradient(${FAMILIA_COR[job.familia] ?? FAMILIA_COR.midia} ${progresso}%, var(--wb-bg-inset) 0)`,
      }}
    />
  );
}

export function GlobalQueue() {
  const { jobs, grupos, clearAll } = useWorkbenchQueue();
  const destaque = jobs.find((job) => ehAtivo(job.estado)) ?? jobs[0];

  return (
    <PanelShell
      id="fila"
      side="right"
      title={
        jobs.length > 0 ? `FILA · ${jobs.length} JOB${jobs.length > 1 ? 'S' : ''}` : 'FILA GLOBAL'
      }
      headerExtra={
        jobs.length > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            aria-label="Limpar toda a fila"
            className="rounded-md bg-[var(--wb-bg-inset)] px-1.5 py-[3px] font-code text-[9px] font-extrabold tracking-[0.1em] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          >
            LIMPAR
          </button>
        ) : null
      }
      indicator={
        destaque ? (
          <CollapsedQueueRing job={destaque} />
        ) : (
          // Fila vazia recolhida também mostra o anel (validação 1, item 12).
          <span
            aria-hidden
            className="h-[15px] w-[15px] rounded-full border-2 border-[var(--wb-border)]"
          />
        )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
        {grupos.map((grupo) =>
          grupo.jobs.length === 1 ? (
            <QueueJobItem key={grupo.chave} job={grupo.jobs[0]} />
          ) : (
            <GrupoItem key={grupo.chave} grupo={grupo} />
          ),
        )}
        <div className="mt-auto rounded-[9px] border border-dashed border-[var(--wb-border)] p-2 text-center text-[10px] font-semibold leading-relaxed text-[var(--wb-text-dim)]">
          arraste um corte aqui para
          <br />
          renderizar em segundo plano
        </div>
      </div>
    </PanelShell>
  );
}
