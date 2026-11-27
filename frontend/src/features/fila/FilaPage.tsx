import {
  useWorkbenchQueue,
  type JobEstado,
  type QueueJob,
} from '@/shared/filaGlobal/useWorkbenchQueue';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { Icon, type IconName } from '@/components/ui/icon';
import { LinhaDaLista, Lista } from '@/components/ui/lista';
import { Progresso } from '@/components/ui/progresso';
import { Selo, type TomDoSelo } from '@/components/ui/selo';
import { DetalheDasExecucoes } from '@/upgrade/GavetaDaFila';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A Fila global como tela.
//
// Fila é o único lugar do app onde a pergunta é "o que a máquina está
// fazendo agora", e responder isso num painel de 260 px obrigava a
// escolher entre o progresso e o log. Aqui cabem os dois, por job.
//
// A fonte é a MESMA do painel (`useWorkbenchQueue`): não há segunda
// fila, só uma segunda vista.
//
// RODADA 2 · a tela passou a poder PARAR a máquina.
//
// O botão único dizia "Tirar da fila" e chamava `removeJob`, que só
// esconde: o render continuava rodando no servidor, gastando GPU, e
// nunca mais reaparecia. `cancelJob` (que chama `filaGlobalApi.cancelarJob`) já
// existia no contexto e não era usado por ninguém aqui.
//
// E "Limpar a lista" dispensava até os jobs rodando — como o cartão do
// trilho só existe enquanto há job ativo, um clique apagava a lista, o
// cartão e o ponto do sino de uma vez: o app ficava sem nenhuma pista de
// que ainda havia trabalho acontecendo. Agora o botão só varre o que já
// terminou, e diz isso no rótulo.
// ─────────────────────────────────────────────────────────────────

// D-1178 (E-069 H-23; DIRECAO §7.13): mesma casca da gaveta da fila (§7.11), em tela cheia.
// Cada job é uma linha de `Lista`, o estado é um `Selo` e o andamento é o `Progresso`.
// Fila não tem primário (PRIMARIOS_POR_TELA): "Cancelar" é destrutivo e o resto é secundário.

const TOM: Record<JobEstado, { texto: string; selo: TomDoSelo }> = {
  aguardando: { texto: 'na espera', selo: 'inerte' },
  rodando: { texto: 'rodando', selo: 'curso' },
  concluido: { texto: 'concluído', selo: 'ok' },
  erro: { texto: 'erro', selo: 'erro' },
  cancelado: { texto: 'cancelado', selo: 'inerte' },
  perdido: { texto: 'perdido', selo: 'convite' },
};

const ICONE_FAMILIA: Record<string, IconName> = {
  ia: 'brain',
  midia: 'clapperboard',
  publicacao: 'rocket',
};

/** Um job que ainda pode ser interrompido. */
function emAndamento(job: QueueJob): boolean {
  return job.estado === 'rodando' || job.estado === 'aguardando';
}

/**
 * "4 min", "12 s" — quanto o job já levou. Devolve vazio quando não dá para
 * saber: job restaurado do armazenamento local não traz início confiável, e
 * "0 s" ao lado de "concluído" afirma uma coisa falsa sobre a duração.
 */
function decorrido(job: QueueJob): string {
  const fim = job.terminalDesde ?? Date.now();
  const seg = Math.round((fim - job.iniciadoEm) / 1000);
  if (!Number.isFinite(seg) || seg <= 0) return '';
  if (seg < 60) return `${seg} s`;
  const min = Math.round(seg / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function LinhaJob({
  job,
  onCancelar,
  onRemover,
}: {
  job: QueueJob;
  onCancelar: () => void;
  onRemover: () => void;
}) {
  const tom = TOM[job.estado];
  const tempo = decorrido(job);
  const andando = emAndamento(job);
  const [aberta, setAberta] = useState(false);

  return (
    <LinhaDaLista className="!flex flex-col !items-stretch gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden
          className="inline-grid size-7 flex-none place-items-center rounded-bloco bg-vidro-2 text-fg-2"
        >
          <Icon name={ICONE_FAMILIA[job.familia] ?? 'loader'} />
        </span>
        {/* `rotulo` já é "alvo → tipo": repeti-lo embaixo só gastaria a linha
            que o log usa melhor. */}
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          aria-expanded={aberta}
          title={aberta ? 'Recolher o detalhe' : 'Ver tempos e linha do tempo (D-769)'}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-corpo font-semibold text-fg"
        >
          <Icon name={aberta ? 'chevron-down' : 'chevron-right'} className="text-fg-3" />
          <span className="min-w-0">{job.rotulo}</span>
        </button>
        <Selo tom={tom.selo}>{tom.texto}</Selo>
        {tempo ? <span className="font-mono text-pequeno text-fg-3">{tempo}</span> : null}

        {/* Dois botões diferentes porque são dois atos diferentes: interromper
            o trabalho, ou arquivar a linha de um trabalho que já acabou.
            Oferecer só o segundo, com o nome do primeiro, era a falha. */}
        {andando ? (
          <Button
            variant="destrutivo"
            size="pq"
            title="Cancelar este job — o processo é interrompido no servidor"
            aria-label={`Cancelar ${job.rotulo} (${job.etapa})`}
            onClick={onCancelar}
          >
            <Icon name="x" />
            Cancelar
          </Button>
        ) : (
          <Button
            variant="icone"
            size="pq"
            title="Tirar da lista (o job já terminou)"
            aria-label={`Tirar ${job.rotulo} da lista`}
            onClick={onRemover}
          >
            <Icon name="x" />
          </Button>
        )}
      </div>

      <Progresso valor={job.progresso} rotulo={`Andamento de ${job.rotulo}`} />

      {/* O log em mono é a única linha da tela que muda sozinha. Ele responde
          "travou ou está andando?" sem abrir nada. */}
      <span className={`font-mono text-pequeno ${job.erro ? 'text-erro' : 'text-fg-3'}`}>
        {job.erro || job.etapa || '—'}
      </span>

      {aberta ? <DetalheDasExecucoes jobs={[job]} /> : null}
    </LinhaDaLista>
  );
}

/** D-1204: a consulta falhou. Nunca o "Nada na fila": ninguém sabe se há algo rodando. */
function FalhaDaFila(props: { motivo: string; aoTentar: () => void; className?: string }) {
  return <EstadoDeErro titulo="Não consegui consultar a fila" {...props} />;
}

export default function FilaPage() {
  const { jobs, removeJob, cancelJob, clearAll, falha, carregando, tentarDeNovo } =
    useWorkbenchQueue();

  const rodando = jobs.filter((j) => j.estado === 'rodando').length;
  const esperando = jobs.filter((j) => j.estado === 'aguardando').length;
  const concluidos = jobs.filter((j) => j.estado === 'concluido').length;
  const terminais = jobs.filter((j) => !emAndamento(j));

  useDefinirChrome(
    {
      // D-1204: sem resposta, "0 rodando" seria afirmar o que ninguém sabe.
      sub: falha
        ? 'sem resposta do backend'
        : `${rodando} rodando · ${esperando} na espera · ${concluidos} concluído${concluidos === 1 ? '' : 's'}`,
      acoes:
        terminais.length > 0
          ? [
              {
                icone: 'trash' as const,
                texto: `Limpar ${terminais.length} concluído${terminais.length === 1 ? '' : 's'}`,
                // Varre só o que terminou. Quem está rodando fica: apagar a
                // linha de um job ativo apaga também o cartão do trilho, e o
                // app perde a única pista de que há trabalho acontecendo.
                onClick: () => terminais.forEach((j) => removeJob(j.id)),
              },
            ]
          : [],
    },
    [rodando, esperando, concluidos, terminais.length, falha],
  );

  // `clearAll` continua existindo para o painel do Workbench; aqui ele não é
  // oferecido de propósito (ver comentário acima).
  void clearAll;

  if (jobs.length === 0) {
    return (
      <div className="h-full overflow-auto px-7 py-6">
        {falha ? (
          <FalhaDaFila motivo={falha} aoTentar={tentarDeNovo} />
        ) : carregando ? (
          <EstadoCarregando frase="Consultando a fila…" linhas={2} />
        ) : (
          <EstadoVazio
            icone="inbox"
            titulo="Nada na fila"
            descricao="Download, análise, render e publicação aparecem aqui enquanto rodam — venha de qual tela vier."
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-7 py-6 text-fg">
      {falha ? (
        <FalhaDaFila
          motivo={`${falha} O que está abaixo é o último estado conhecido.`}
          aoTentar={tentarDeNovo}
          className="mb-4 max-w-[960px] p-5"
        />
      ) : null}
      <Lista colunas="1fr" aria-label="Jobs da fila" className="max-w-[960px]">
        {jobs.map((job) => (
          <LinhaJob
            key={job.id}
            job={job}
            onCancelar={() => void cancelJob(job.id)}
            onRemover={() => removeJob(job.id)}
          />
        ))}
      </Lista>
    </div>
  );
}
