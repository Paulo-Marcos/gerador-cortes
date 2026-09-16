import { useWorkbenchQueue, type JobEstado, type QueueJob } from '@/components/workbench/useWorkbenchQueue';
import { Icon, type IconName } from '../Icon';
import { useDefinirChrome } from '../UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A Fila global como tela.
//
// Ela já existia como painel lateral do shell Workbench. O design lhe
// dá uma tela inteira, e faz sentido: fila é o único lugar do app onde
// a pergunta é "o que a máquina está fazendo agora", e responder isso
// num painel de 260 px obrigava a escolher entre o progresso e o log.
// Aqui cabem os dois, um embaixo do outro, por job.
//
// A fonte é a MESMA do painel (`useWorkbenchQueue`): não há segunda
// fila, só uma segunda vista.
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

function LinhaJob({ job, onRemover }: { job: QueueJob; onRemover: () => void }) {
  const tom = TOM[job.estado];
  const pct = `${Math.round(job.progresso)}%`;

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
        {decorrido(job) ? (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
            {decorrido(job)}
          </span>
        ) : null}
        <button
          type="button"
          className="btn btn-icon"
          title="Tirar da fila"
          aria-label={`Tirar ${job.rotulo} da fila`}
          onClick={onRemover}
        >
          <Icon name="x" size={13} />
        </button>
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
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--dim)' }}>
        {job.erro || job.etapa || '—'}
      </span>
    </article>
  );
}

export default function FilaPage() {
  const { jobs, removeJob, clearAll } = useWorkbenchQueue();

  const rodando = jobs.filter((j) => j.estado === 'rodando').length;
  const esperando = jobs.filter((j) => j.estado === 'aguardando').length;
  const concluidos = jobs.filter((j) => j.estado === 'concluido').length;

  useDefinirChrome(
    {
      sub: `${rodando} rodando · ${esperando} na espera · ${concluidos} concluído${concluidos === 1 ? '' : 's'}`,
      acoes:
        jobs.length > 0
          ? [{ icone: 'x' as const, texto: 'Limpar a lista', onClick: clearAll }]
          : [],
    },
    [rodando, esperando, concluidos, jobs.length],
  );

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
        <LinhaJob key={job.id} job={job} onRemover={() => removeJob(job.id)} />
      ))}
    </div>
  );
}
