import { Ban, Maximize2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { PanelShell } from './PanelShell';
import {
  ehAtivo,
  useWorkbenchQueue,
  type GrupoFila,
  type JobEstado,
  type JobFamilia,
  type MarcoJob,
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
// D-435: o clique abre um MODAL, não mais uma lista embutida. A
// coluna tem ~230 px — cabia o rótulo e nada do que interessa quando
// algo trava: desde quando o job não anda, por quais etapas ele
// passou e o texto inteiro do erro. Tudo isso já está no estado da
// fila (`historico`/`atualizadoEm`); só faltava lugar para mostrar.
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
  segmentos: 'cortes',
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

const ESTADO_LABEL: Record<JobEstado, string> = {
  aguardando: 'na fila',
  rodando: 'rodando',
  concluido: 'concluído',
  erro: 'falhou',
  cancelado: 'cancelado',
  perdido: 'perdido',
};

const ESTADO_COR: Record<JobEstado, string> = {
  aguardando: 'var(--wb-text-dim)',
  rodando: 'var(--wb-accent)',
  concluido: 'var(--wb-ok)',
  erro: 'var(--wb-err)',
  cancelado: 'var(--wb-text-dim)',
  perdido: 'var(--wb-text-dim)',
};

/**
 * Explicação do desfecho `perdido`. O operador precisa saber que a fila não
 * está mentindo — ela apenas perdeu o job de vista (ver D-435).
 */
const TEXTO_PERDIDO =
  'O backend parou de publicar esta execução sem informar o desfecho — em geral porque foi reiniciado. Confira o resultado na aba correspondente.';

/** "3 min", "1 h 12 min", "há instantes" — precisão suficiente para a fila. */
function duracaoHumana(ms: number): string {
  const segundos = Math.max(0, Math.round(ms / 1000));
  if (segundos < 10) return 'instantes';
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

function horaDe(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('pt-BR', { hour12: false });
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

/** Rótulo do item: é ele que abre o detalhe (D-435). */
function TituloDoJob({
  job,
  texto,
  corTexto,
  corPonto,
  onAbrirDetalhe,
}: {
  job: QueueJob;
  texto: string;
  corTexto?: string;
  corPonto?: string;
  onAbrirDetalhe: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrirDetalhe}
      aria-label={`Ver detalhe de ${job.rotulo}`}
      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
    >
      <Maximize2 size={10} aria-hidden className="flex-none text-[var(--wb-text-dim)]" />
      {corPonto ? (
        <span
          aria-hidden
          className="h-[6px] w-[6px] flex-none rounded-full"
          style={{ background: corPonto }}
        />
      ) : null}
      <span
        className="truncate text-[10.5px] font-bold"
        style={corTexto ? { color: corTexto } : undefined}
      >
        {texto}
      </span>
    </button>
  );
}

function QueueJobItem({ job, onAbrirDetalhe }: { job: QueueJob; onAbrirDetalhe: () => void }) {
  const { removeJob } = useWorkbenchQueue();
  const cor = FAMILIA_COR[job.familia] ?? FAMILIA_COR.midia;
  const remover = <BotaoRemover rotulo={job.rotulo} onRemover={() => removeJob(job.id)} />;

  if (job.estado === 'concluido') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-ok-soft)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <TituloDoJob
            job={job}
            texto={`${job.rotulo} ✓ pronto`}
            corTexto="var(--wb-ok)"
            onAbrirDetalhe={onAbrirDetalhe}
          />
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
          <TituloDoJob
            job={job}
            texto={job.rotulo}
            corTexto="var(--wb-err)"
            onAbrirDetalhe={onAbrirDetalhe}
          />
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
  // num alarme (D-426). `perdido` divide o mesmo visual: também não é falha
  // do pipeline, é a fila admitindo que não sabe o desfecho (D-435).
  if (job.estado === 'cancelado' || job.estado === 'perdido') {
    return (
      <div className="rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
        <div className="flex items-start justify-between gap-1">
          <TituloDoJob
            job={job}
            texto={`${job.rotulo} · ${ESTADO_LABEL[job.estado]}`}
            corTexto="var(--wb-text-dim)"
            onAbrirDetalhe={onAbrirDetalhe}
          />
          {remover}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[9px] bg-[var(--wb-warn-soft)] p-2.5">
      <div className="flex items-start justify-between gap-1">
        <TituloDoJob
          job={job}
          texto={job.rotulo}
          corPonto={cor}
          onAbrirDetalhe={onAbrirDetalhe}
        />
        <span className="flex flex-none items-center gap-1">
          {podeCancelar(job) ? <BotaoCancelar job={job} /> : null}
          {remover}
        </span>
      </div>
      <BarraProgresso job={job} />
    </div>
  );
}

/** Linha do tempo do job: por onde ele passou e quando. */
function LinhaDoTempo({ marcos }: { marcos: MarcoJob[] }) {
  if (marcos.length === 0) {
    return (
      <p className="text-[11px] text-[var(--wb-text-dim)]">
        Sem etapas registradas ainda — o primeiro avanço aparece aqui.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1">
      {marcos.map((marco, indice) => (
        <li
          key={`${marco.em}-${indice}`}
          className="flex items-baseline gap-2 text-[11px] leading-snug"
        >
          <span className="flex-none font-code text-[10px] text-[var(--wb-text-dim)]">
            {horaDe(marco.em)}
          </span>
          <span
            className="flex-none font-code text-[10px] font-bold"
            style={{ color: ESTADO_COR[marco.estado] }}
          >
            {marco.progresso}%
          </span>
          <span className="min-w-0 break-words">{marco.etapa || ESTADO_LABEL[marco.estado]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Etapa atual e os dois tempos que dizem se o job anda ou travou. */
function TemposDoJob({ job, agora }: { job: QueueJob; agora: number }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
      <dt className="text-[var(--wb-text-dim)]">Etapa</dt>
      <dd className="break-words font-semibold">{job.etapa || '—'}</dd>
      <dt className="text-[var(--wb-text-dim)]">Na fila há</dt>
      <dd>{duracaoHumana(agora - job.iniciadoEm)}</dd>
      <dt className="text-[var(--wb-text-dim)]">Último avanço</dt>
      <dd>
        {horaDe(job.atualizadoEm)} · há {duracaoHumana(agora - job.atualizadoEm)}
      </dd>
    </dl>
  );
}

/** Um job dentro do modal: estado, tempos, erro completo e por onde passou. */
function JobDetalhe({ job, agora }: { job: QueueJob; agora: number }) {
  const { removeJob } = useWorkbenchQueue();
  const cor = FAMILIA_COR[job.familia] ?? FAMILIA_COR.midia;
  const progresso = Math.max(0, Math.min(100, Math.round(job.progresso)));

  return (
    <section className="rounded-[10px] border border-[var(--wb-border)] p-3">
      <header className="flex items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-[13px] font-bold">
          <span
            aria-hidden
            className="h-[8px] w-[8px] flex-none rounded-full"
            style={{ background: cor }}
          />
          <span className="truncate">{job.rotuloTipo || job.tipo}</span>
          <span
            className="flex-none rounded-full px-2 py-[1px] font-code text-[9.5px] font-extrabold uppercase tracking-[0.08em]"
            style={{ color: ESTADO_COR[job.estado], background: 'var(--wb-bg-inset)' }}
          >
            {ESTADO_LABEL[job.estado]}
          </span>
        </h3>
        <span className="flex flex-none items-center gap-2">
          {podeCancelar(job) ? <BotaoCancelar job={job} /> : null}
          <BotaoRemover rotulo={job.rotulo} onRemover={() => removeJob(job.id)} />
        </span>
      </header>

      <div className="my-2 h-1.5 rounded-sm bg-[var(--wb-bg-inset)]">
        <div
          className="h-full rounded-sm transition-[width] duration-500"
          style={{ width: `${progresso}%`, background: cor }}
        />
      </div>

      <TemposDoJob job={job} agora={agora} />

      {job.estado === 'perdido' ? (
        <p className="mt-2 rounded-md bg-[var(--wb-bg-inset)] p-2 text-[11px] leading-snug text-[var(--wb-text-dim)]">
          {TEXTO_PERDIDO}
        </p>
      ) : null}

      {job.erro ? (
        <p className="mt-2 break-words rounded-md bg-[var(--wb-err-soft)] p-2 text-[11px] leading-snug text-[var(--wb-err)]">
          {job.erro}
        </p>
      ) : null}

      <div className="mt-3">
        <h4 className="mb-1 font-code text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[var(--wb-text-dim)]">
          Linha do tempo
        </h4>
        <LinhaDoTempo marcos={job.historico} />
      </div>

      {job.projetoId ? (
        <Link
          to={destinoDoJob(job)}
          className="mt-2 inline-block text-[11.5px] font-semibold underline"
          style={{ color: cor }}
        >
          abrir na aba {ETAPA_LABEL[etapaDoJob(job)]} →
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Detalhe de tudo que está rodando num alvo. Fica num portal porque a fila vive
 * dentro de um painel com `overflow` — o modal precisa escapar dele.
 */
function ModalDetalhe({ grupo, onFechar }: { grupo: GrupoFila; onFechar: () => void }) {
  // Relógio próprio: o poll só re-renderiza quando ALGO muda, e é justamente no
  // job travado — que não muda — que o operador precisa ver o tempo correndo.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return createPortal(
    <div
      role="presentation"
      onClick={onFechar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhe da fila — ${grupo.rotulo}`}
        onClick={(evento) => evento.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-[14px] bg-[var(--wb-bg)] text-[var(--wb-text)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-[var(--wb-border)] p-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-extrabold">{grupo.rotulo}</h2>
            <p className="mt-0.5 text-[11px] text-[var(--wb-text-dim)]">
              {grupo.jobs.length} {grupo.jobs.length === 1 ? 'execução' : 'execuções'} neste alvo
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar detalhe da fila"
            onClick={onFechar}
            className="flex-none rounded-md p-1 text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
          {grupo.jobs.map((job) => (
            <JobDetalhe key={job.id} job={job} agora={agora} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Linha de um alvo com mais de uma execução: resume e abre o detalhe no clique.
 * O resumo segue o job de destaque (`PRIORIDADE_ESTADO`) — a falha, ou o que
 * ainda roda.
 */
function GrupoItem({ grupo, onAbrirDetalhe }: { grupo: GrupoFila; onAbrirDetalhe: () => void }) {
  const { removeJob } = useWorkbenchQueue();
  const { destaque } = grupo;
  const cor = FAMILIA_COR[destaque.familia] ?? FAMILIA_COR.midia;
  const ativos = grupo.jobs.filter((job) => ehAtivo(job.estado)).length;

  return (
    <div className="rounded-[9px] bg-[var(--wb-warn-soft)] p-2.5">
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={onAbrirDetalhe}
          aria-label={`Ver detalhe de ${grupo.rotulo}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Maximize2 size={10} aria-hidden className="flex-none" />
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

      <BarraProgresso job={destaque} />
      <div className="mt-0.5 text-[9px] font-semibold text-[var(--wb-text-dim)]">
        {destaque.rotuloTipo}
        {ativos > 1 ? ` · +${ativos - 1} em andamento` : ''}
      </div>
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
  // Guarda a CHAVE, não o grupo: assim o modal segue vivo a cada poll, com os
  // dados novos. Guardar o objeto congelaria o detalhe no instante do clique.
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);
  const grupoAberto = grupos.find((grupo) => grupo.chave === chaveAberta) ?? null;

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
            <QueueJobItem
              key={grupo.chave}
              job={grupo.jobs[0]}
              onAbrirDetalhe={() => setChaveAberta(grupo.chave)}
            />
          ) : (
            <GrupoItem
              key={grupo.chave}
              grupo={grupo}
              onAbrirDetalhe={() => setChaveAberta(grupo.chave)}
            />
          ),
        )}
        <div className="mt-auto rounded-[9px] border border-dashed border-[var(--wb-border)] p-2 text-center text-[10px] font-semibold leading-relaxed text-[var(--wb-text-dim)]">
          arraste um corte aqui para
          <br />
          renderizar em segundo plano
        </div>
      </div>
      {grupoAberto ? (
        <ModalDetalhe grupo={grupoAberto} onFechar={() => setChaveAberta(null)} />
      ) : null}
    </PanelShell>
  );
}
