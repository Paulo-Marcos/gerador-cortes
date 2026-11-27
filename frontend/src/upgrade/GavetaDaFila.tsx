import { useEffect, useState, type ReactNode } from 'react';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Progresso } from '@/components/ui/progresso';
import { Selo, type TomDoSelo } from '@/components/ui/selo';
import {
  ehAtivo,
  useWorkbenchQueue,
  type GrupoFila,
  type JobEstado,
  type MarcoJob,
  type QueueJob,
} from '@/shared/filaGlobal/useWorkbenchQueue';
import { dividirNosTresGrupos, posicaoNaFila, resumoDaFila } from './cartaoDaFila';
import { Icon } from './Icon';
import { LoteNaFila, useLoteDaFila } from './LoteNaFila';

// ─────────────────────────────────────────────────────────────────
// D-746 · a fila é uma CONSULTA, não um destino: gaveta sobre a tela atual.
// O operador reclamava de ir "para outra pasta" só para ver o progresso, e de
// não haver um X porque não havia o que fechar. Consultar não é navegar.
//
// D-1144 (E-069 H-14, DIRECAO §7.11): a gaveta é o `Dialog lateral` da Sala
// escura (foco preso, Esc, foco de volta, véu) com os três grupos: Agora,
// Esperando e Prontos nesta sessão. O que NÃO muda, porque já existia:
//   · `cancelJob(id)` pede o cancelamento real ao backend (D-426);
//   · a fila se desenha por GRUPO, não por job (`agruparFila`, D-425): tudo do
//     mesmo alvo numa linha ("265 · corte 7" com render + capa + meta).
// ─────────────────────────────────────────────────────────────────

/**
 * Os SEIS estados do job no vocabulário do selo. `perdido` e `cancelado`
 * existem e não podem cair num `else` genérico: "perdido" é anomalia que
 * o operador precisa ver, "cancelado" é desfecho que ele mesmo pediu.
 */
const TOM_DO_JOB: Record<JobEstado, TomDoSelo> = {
  rodando: 'curso',
  aguardando: 'inerte',
  concluido: 'ok',
  erro: 'erro',
  perdido: 'convite',
  cancelado: 'inerte',
};

const COR_DO_PERCENTUAL: Record<TomDoSelo, string> = {
  curso: 'text-info',
  ok: 'text-ok',
  erro: 'text-erro',
  convite: 'text-aviso',
  inerte: 'text-fg-3',
  neutro: 'text-fg-3',
};

const TEXTO_DO_JOB: Record<JobEstado, string> = {
  rodando: 'rodando',
  aguardando: 'na espera',
  concluido: 'concluído',
  erro: 'erro',
  perdido: 'perdido',
  cancelado: 'cancelado',
};

// D-769 · o detalhe por execução: os tempos e a linha do tempo de cada job do
// alvo. Tudo está no estado da fila (`historico`, `atualizadoEm`); ele se abre
// DENTRO da linha, sem outro diálogo sobre a gaveta.

const TEXTO_PERDIDO =
  'O backend parou de publicar esta execução sem informar o desfecho — em geral porque foi reiniciado. Confira o resultado na tela correspondente.';

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

/**
 * Relógio próprio: o poll só re-renderiza quando algo muda, e é justamente no
 * job travado — que não muda — que o operador precisa ver o tempo correndo.
 */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return agora;
}

function LinhaDoTempo({ marcos }: { marcos: MarcoJob[] }) {
  if (marcos.length === 0) {
    return <span className="font-mono text-micro text-fg-3">Sem etapas registradas ainda.</span>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {marcos.map((marco, indice) => (
        <li key={`${marco.em}-${indice}`} className="flex items-baseline gap-2 text-pequeno">
          <span className="flex-none font-mono text-micro text-fg-3">{horaDe(marco.em)}</span>
          <span className={`w-9 flex-none text-right font-mono text-micro font-bold ${COR_DO_PERCENTUAL[TOM_DO_JOB[marco.estado]]}`}>
            {Math.round(marco.progresso)}%
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{marco.etapa || TEXTO_DO_JOB[marco.estado]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Uma execução por extenso: estado, tempos, erro completo e por onde passou. */
function ExecucaoDoJob({ job, agora }: { job: QueueJob; agora: number }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-[12px] bg-poco p-2.5">
      <span className="flex items-center gap-2">
        <strong className="min-w-0 flex-1 text-pequeno">{job.rotuloTipo || job.tipo}</strong>
        <Selo tom={TOM_DO_JOB[job.estado]}>{TEXTO_DO_JOB[job.estado]}</Selo>
      </span>
      <span className="font-mono text-micro text-fg-3">
        {`na fila há ${duracaoHumana(agora - job.iniciadoEm)} · último avanço ${horaDe(job.atualizadoEm)} (há ${duracaoHumana(agora - job.atualizadoEm)})`}
      </span>
      {job.estado === 'perdido' ? <span className="text-pequeno text-fg-2">{TEXTO_PERDIDO}</span> : null}
      {job.erro ? <span className="font-mono text-micro text-erro [overflow-wrap:anywhere]">{job.erro}</span> : null}
      <LinhaDoTempo marcos={job.historico} />
    </section>
  );
}

/** As execuções de um alvo, da mais recente para a mais antiga. */
export function DetalheDasExecucoes({ jobs }: { jobs: QueueJob[] }) {
  const agora = useAgora();
  const ordenados = [...jobs].sort((a, b) => b.iniciadoEm - a.iniciadoEm);
  return (
    <div className="flex flex-col gap-1.5">
      {ordenados.map((job) => (
        <ExecucaoDoJob key={job.id} job={job} agora={agora} />
      ))}
    </div>
  );
}

/** O que a linha diz em baixo: o erro tem precedência, porque é ele que resolve o problema. */
const textoDaEtapa = (job: QueueJob) => job.erro || job.etapa || job.rotuloTipo;

/** Quem encerra o grupo: cancela o que anda no servidor, ou tira da lista o que já terminou. */
function useEncerrarGrupo(grupo: GrupoFila) {
  const { cancelJob, removeJob } = useWorkbenchQueue();
  const ativo = ehAtivo(grupo.estado);
  const encerrar = () => {
    if (ativo) void cancelJob(grupo.destaque.id).catch(() => undefined);
    else grupo.jobs.forEach((j) => removeJob(j.id));
  };
  return { ativo, encerrar };
}

function TituloDoGrupo({ grupo, aberta, aoAlternar }: { grupo: GrupoFila; aberta: boolean; aoAlternar: () => void }) {
  return (
    <button
      type="button"
      data-sala=""
      onClick={aoAlternar}
      aria-expanded={aberta}
      title={aberta ? 'Recolher o detalhe' : 'Ver o detalhe de cada execução'}
      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[8px] text-left text-corpo font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <Icon name={aberta ? 'chevron-down' : 'chevron-right'} className="flex-none text-fg-3" />
      <span className="min-w-0 flex-1 truncate">{grupo.rotulo}</span>
      {/* Mais de um job no mesmo alvo: o número evita a linha mentir. */}
      {grupo.jobs.length > 1 ? <span className="flex-none font-mono text-micro text-fg-3">{grupo.jobs.length} jobs</span> : null}
    </button>
  );
}

const CARTAO_DA_LINHA = 'flex list-none flex-col gap-2 rounded-[14px] border border-fio bg-vidro p-3';

/** Agora: o selo em curso, a barra com o percentual, a etapa e "Cancelar". */
function LinhaAgora({ grupo }: { grupo: GrupoFila }) {
  const [aberta, setAberta] = useState(false);
  const { encerrar } = useEncerrarGrupo(grupo);
  const job = grupo.destaque;
  return (
    <li className={CARTAO_DA_LINHA}>
      <div className="flex items-center gap-2">
        <TituloDoGrupo grupo={grupo} aberta={aberta} aoAlternar={() => setAberta((v) => !v)} />
        <Selo tom={TOM_DO_JOB[grupo.estado]}>{TEXTO_DO_JOB[grupo.estado]}</Selo>
      </div>
      <Progresso valor={job.progresso} rotulo={`Andamento de ${grupo.rotulo}`} />
      <div className="flex items-center gap-2">
        <span className={`min-w-0 flex-1 text-pequeno ${job.erro ? 'text-erro' : 'text-fg-3'}`}>{textoDaEtapa(job)}</span>
        <Button variant="destrutivo" size="pq" onClick={encerrar} title={`Cancelar ${job.rotulo} (${job.etapa}): o processo para no servidor`}>
          Cancelar
        </Button>
      </div>
      {aberta ? <DetalheDasExecucoes jobs={grupo.jobs} /> : null}
    </li>
  );
}

/** Esperando: a posição na fila num selo inerte e o ⋯ com o que se pode fazer. */
function LinhaEsperando({ grupo, posicao }: { grupo: GrupoFila; posicao: number }) {
  const [aberta, setAberta] = useState(false);
  const { encerrar } = useEncerrarGrupo(grupo);
  return (
    <li className={CARTAO_DA_LINHA}>
      <div className="flex items-center gap-2">
        <TituloDoGrupo grupo={grupo} aberta={aberta} aoAlternar={() => setAberta((v) => !v)} />
        <Selo tom="inerte" dica="Posição na fila">{posicaoNaFila(posicao)}</Selo>
        <Menu>
          <MenuTrigger asChild>
            <IconButton variant="fantasma" size="pq" aria-label={`Mais ações de ${grupo.rotulo}`}>
              <Icon name="more-horizontal" />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icone="ban" perigo onSelect={encerrar}>
              Tirar da fila
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <span className="text-pequeno text-fg-3">{textoDaEtapa(grupo.destaque)}</span>
      {aberta ? <DetalheDasExecucoes jobs={grupo.jobs} /> : null}
    </li>
  );
}

/** Prontos nesta sessão: o selo do desfecho, "Ver" o detalhe e tirar da lista. */
function LinhaPronta({ grupo }: { grupo: GrupoFila }) {
  const [aberta, setAberta] = useState(false);
  const { encerrar } = useEncerrarGrupo(grupo);
  return (
    <li className={CARTAO_DA_LINHA}>
      <div className="flex items-center gap-2">
        <TituloDoGrupo grupo={grupo} aberta={aberta} aoAlternar={() => setAberta((v) => !v)} />
        <Selo tom={TOM_DO_JOB[grupo.estado]}>{TEXTO_DO_JOB[grupo.estado]}</Selo>
        <Button variant="fantasma" size="pq" onClick={() => setAberta((v) => !v)}>
          {aberta ? 'Recolher' : 'Ver'}
        </Button>
        <IconButton variant="fantasma" size="pq" aria-label={`Tirar ${grupo.rotulo} da lista`} title="Tirar da lista (já terminou)" onClick={encerrar}>
          <Icon name="x" />
        </IconButton>
      </div>
      {grupo.destaque.erro ? <span className="text-pequeno text-erro">{grupo.destaque.erro}</span> : null}
      {aberta ? <DetalheDasExecucoes jobs={grupo.jobs} /> : null}
    </li>
  );
}

function GrupoDaGaveta({ titulo, quantos, children }: { titulo: string; quantos: number; children: ReactNode }) {
  if (quantos === 0) return null;
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-micro text-fg-3">
        {titulo}
        <span className="font-mono font-medium tabular-nums">{quantos}</span>
      </h3>
      <ul className="m-0 flex flex-col gap-2 p-0">{children}</ul>
    </section>
  );
}

/** D-897: o lote de publicação no topo, os três grupos embaixo. "Nada rodando" só sem nenhum dos dois. */
function ConteudoDaFila({
  grupos,
  falha,
  aoTentar,
}: {
  grupos: GrupoFila[];
  falha: string | null;
  aoTentar: () => void;
}) {
  // Lido aqui, e não recebido da gaveta: este conteúdo monta a cada abertura,
  // e é essa montagem que pergunta de novo ao backend (lote disparado em outra aba).
  const lote = useLoteDaFila();
  const { agora, esperando, prontos } = dividirNosTresGrupos(grupos);
  return (
    <div className="flex flex-col gap-4 pb-2">
      <LoteNaFila lote={lote} />
      {falha ? (
        <EstadoDeErro className="p-5" titulo="Não consegui consultar a fila" motivo={falha} aoTentar={aoTentar} />
      ) : null}
      {grupos.length === 0 && !lote && !falha ? (
        <p className="m-0 px-3 py-7 text-center text-corpo text-fg-3">Nada rodando agora.</p>
      ) : null}
      <GrupoDaGaveta titulo="Agora" quantos={agora.length}>
        {agora.map((g) => (
          <LinhaAgora key={g.chave} grupo={g} />
        ))}
      </GrupoDaGaveta>
      <GrupoDaGaveta titulo="Esperando" quantos={esperando.length}>
        {esperando.map((g, i) => (
          <LinhaEsperando key={g.chave} grupo={g} posicao={i} />
        ))}
      </GrupoDaGaveta>
      <GrupoDaGaveta titulo="Prontos nesta sessão" quantos={prontos.length}>
        {prontos.map((g) => (
          <LinhaPronta key={g.chave} grupo={g} />
        ))}
      </GrupoDaGaveta>
    </div>
  );
}

/** ⌘J também fecha: com a gaveta aberta o teclado da casca se cala (há um diálogo na tela). */
function useFecharComCtrlJ(aberta: boolean, aoFechar: () => void) {
  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        e.stopPropagation();
        aoFechar();
      }
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => document.removeEventListener('keydown', aoTeclar, true);
  }, [aberta, aoFechar]);
}

export function GavetaDaFila({
  aberta,
  aoFechar,
  aoAbrirTelaCheia,
  children,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aoAbrirTelaCheia: () => void;
  /** Conteúdo alternativo (vitrines/teste). Em uso normal, omitir. */
  children?: ReactNode;
}) {
  const { grupos, falha, tentarDeNovo } = useWorkbenchQueue();
  const lote = useLoteDaFila();
  useFecharComCtrlJ(aberta, aoFechar);

  // Sempre montada: o `Dialog` fechado não desenha nada, e é ele que devolve o foco a quem a
  // abriu (o cartão do trilho, o sino). Desmontar ao fechar pularia essa devolução.
  return (
    <Dialog
      open={aberta}
      onClose={aoFechar}
      tamanho="lateral"
      title="Fila de processamento"
      description={falha ? 'sem resposta do backend' : resumoDaFila(grupos, Boolean(lote))}
      footer={
        <div className="flex w-full items-center gap-3">
          <p className="m-0 min-w-0 flex-1 text-pequeno text-fg-3">Os renders seguem com a gaveta fechada.</p>
          <Button variant="secundario" size="pq" onClick={aoAbrirTelaCheia} title="Abrir a fila em tela cheia (/fila)">
            <Icon name="maximize" />
            Tela cheia
          </Button>
        </div>
      }
    >
      {children ?? <ConteudoDaFila grupos={grupos} falha={falha} aoTentar={tentarDeNovo} />}
    </Dialog>
  );
}
