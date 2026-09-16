import {
  useWorkbenchQueue,
  type JobEstado,
  type QueueJob,
} from '@/components/workbench/useWorkbenchQueue';
import { Icon, type IconName } from '../Icon';
import { useDefinirChrome } from '../UpgradeChrome';

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
// nunca mais reaparecia. `cancelJob` (que chama `api.cancelarJob`) já
// existia no contexto e não era usado por ninguém aqui.
//
// E "Limpar a lista" dispensava até os jobs rodando — como o cartão do
// trilho só existe enquanto há job ativo, um clique apagava a lista, o
// cartão e o ponto do sino de uma vez: o app ficava sem nenhuma pista de
// que ainda havia trabalho acontecendo. Agora o botão só varre o que já
// terminou, e diz isso no rótulo.
// ─────────────────────────────────────────────────────────────────

const TOM: Record<JobEstado, { texto: string; cor: string; bg: string; barra: string }> = {
  aguardando: { texto: 'na espera', cor: 'var(--mute)', bg: 'var(--inset)', barra: 'var(--inset)' },
  rodando: {
    texto: 'rodando',
    cor: 'var(--accent2)',
    bg: 'var(--accent-soft)',
    barra: 'var(--accent)',
  },
  concluido: { texto: 'concluído', cor: 'var(--ok)', bg: 'var(--ok-soft)', barra: 'var(--ok)' },
  erro: { texto: 'erro', cor: 'var(--err)', bg: 'var(--err-soft)', barra: 'var(--err)' },
  cancelado: { texto: 'cancelado', cor: 'var(--mute)', bg: 'var(--inset)', barra: 'var(--inset)' },
  perdido: { texto: 'perdido', cor: 'var(--warn)', bg: 'var(--warn-soft)', barra: 'var(--warn)' },
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
  const pct = `${Math.round(job.progresso)}%`;
  const tempo = decorrido(job);
  const andando = emAndamento(job);

  return (
    <article
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 12px' }}
    >
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 26,
            height: 26,
            borderRadius: 'var(--r2)',
            background: tom.bg,
            color: tom.cor,
          }}
        >
          <Icon name={ICONE_FAMILIA[job.familia] ?? 'loader'} size={13} />
        </span>
        {/* `rotulo` já é "alvo → tipo": repeti-lo embaixo só gastaria a linha
            que o log usa melhor. */}
        <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>{job.rotulo}</span>
        <span style={{ flex: 1, minWidth: 8 }} />
        <span className="chip" style={{ background: tom.bg, color: tom.cor }}>
          {tom.texto}
        </span>
        {tempo ? (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
            {tempo}
          </span>
        ) : null}

        {/* Dois botões diferentes porque são dois atos diferentes: interromper
            o trabalho, ou arquivar a linha de um trabalho que já acabou.
            Oferecer só o segundo, com o nome do primeiro, era a falha. */}
        {andando ? (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            title="Cancelar este job — o processo é interrompido no servidor"
            aria-label={`Cancelar ${job.rotulo}`}
            onClick={onCancelar}
          >
            <Icon name="x" size={12} />
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-icon btn-sm"
            title="Tirar da lista (o job já terminou)"
            aria-label={`Tirar ${job.rotulo} da lista`}
            onClick={onRemover}
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--inset)' }}
          aria-hidden
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: pct,
              borderRadius: 2,
              background: tom.barra,
            }}
          />
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--mute)',
            width: 38,
            textAlign: 'right',
          }}
        >
          {pct}
        </span>
      </span>

      {/* O log em mono é a única linha da tela que muda sozinha. Ele responde
          "travou ou está andando?" sem abrir nada. */}
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: job.erro ? 'var(--err)' : 'var(--mute)',
        }}
      >
        {job.erro || job.etapa || '—'}
      </span>
    </article>
  );
}

export default function FilaPage() {
  const { jobs, removeJob, cancelJob, clearAll } = useWorkbenchQueue();

  const rodando = jobs.filter((j) => j.estado === 'rodando').length;
  const esperando = jobs.filter((j) => j.estado === 'aguardando').length;
  const concluidos = jobs.filter((j) => j.estado === 'concluido').length;
  const terminais = jobs.filter((j) => !emAndamento(j));

  useDefinirChrome(
    {
      sub: `${rodando} rodando · ${esperando} na espera · ${concluidos} concluído${concluidos === 1 ? '' : 's'}`,
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
    [rodando, esperando, concluidos, terminais.length],
  );

  // `clearAll` continua existindo para o painel do Workbench; aqui ele não é
  // oferecido de propósito (ver comentário acima).
  void clearAll;

  if (jobs.length === 0) {
    return (
      <div
        className="card"
        style={{
          display: 'grid',
          placeItems: 'center',
          gap: 7,
          padding: 22,
          textAlign: 'center',
          maxWidth: 960,
        }}
      >
        <Icon name="inbox" size={22} style={{ color: 'var(--dim)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Nada na fila</span>
        <span style={{ fontSize: 11.5, color: 'var(--mute)', maxWidth: 260, lineHeight: 1.5 }}>
          Download, análise, render e publicação aparecem aqui enquanto rodam — venha de qual tela
          vier.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 960 }}>
      {jobs.map((job) => (
        <LinhaJob
          key={job.id}
          job={job}
          onCancelar={() => void cancelJob(job.id)}
          onRemover={() => removeJob(job.id)}
        />
      ))}
    </div>
  );
}
