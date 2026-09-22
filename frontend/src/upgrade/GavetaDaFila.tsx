import { useEffect, useRef, type ReactNode } from 'react';
import {
  ehAtivo,
  useWorkbenchQueue,
  type GrupoFila,
  type JobEstado,
} from '@/components/workbench/useWorkbenchQueue';
import { Icon } from './Icon';
import { SeloDeEstado, type TomDoSelo } from './SeloDeEstado';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · a fila deixa de ser um desvio de rota.
//
// A queixa: "eu abro e é como se eu tivesse ido para outra pasta e para
// voltar fica uma tortura. A fila era para ser só um modal ou off-canvas."
//
// Estava literalmente assim: o cartão do trilho e o sino da barra faziam
// `navigate('/fila')` (UpgradeShell.tsx → `filaDoTrilho().to` e
// `onAbrirAvisos`). Consultar o progresso custava a tela, a rolagem e o
// corte selecionado — e não havia um X, porque não havia o que fechar.
//
// Consultar não é navegar. A fila é uma CONSULTA: dura cinco segundos,
// acontece no meio de outra coisa, e o destino depois dela é sempre de
// onde a pessoa veio. Isso é gaveta, não rota.
//
// DUAS COISAS QUE O PATCH NÃO INVENTA, porque já existem:
//   · `cancelJob(id)` já pede o cancelamento real ao backend (D-426) e já
//     faz a marca otimista. A gaveta CHAMA isso — não é um X decorativo.
//   · a fila se desenha por GRUPO, não por job: `agruparFila` junta tudo
//     do mesmo alvo numa linha ("265 · corte 7" com render + capa + meta).
//     Renderizar `jobs` cru encheria a gaveta de linhas quase idênticas,
//     que é o que o D-425 já tinha resolvido.
// ─────────────────────────────────────────────────────────────────

/**
 * Os SEIS estados do job no vocabulário do selo. `perdido` e `cancelado`
 * existem e não podem cair num `else` genérico: "perdido" é anomalia que
 * o operador precisa ver, "cancelado" é desfecho que ele mesmo pediu.
 */
const TOM_DO_JOB: Record<JobEstado, TomDoSelo> = {
  rodando: 'info',
  aguardando: 'inerte',
  concluido: 'ok',
  erro: 'erro',
  perdido: 'aviso',
  cancelado: 'inerte',
};

const COR_DA_BARRA: Record<TomDoSelo, string> = {
  info: 'var(--info)',
  ok: 'var(--ok)',
  erro: 'var(--err)',
  aviso: 'var(--warn)',
  inerte: 'var(--dim)',
};

const TEXTO_DO_JOB: Record<JobEstado, string> = {
  rodando: 'rodando',
  aguardando: 'na espera',
  concluido: 'concluído',
  erro: 'erro',
  perdido: 'perdido',
  cancelado: 'cancelado',
};

function LinhaDaFila({ grupo }: { grupo: GrupoFila }) {
  const { cancelJob, removeJob } = useWorkbenchQueue();
  const job = grupo.destaque;
  const ativo = ehAtivo(grupo.estado);
  const tom = TOM_DO_JOB[grupo.estado];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {grupo.rotulo}
        </span>
        {/* Mais de um job no mesmo alvo: o número evita a linha mentir. */}
        {grupo.jobs.length > 1 ? (
          <span className="lbl">{grupo.jobs.length} jobs</span>
        ) : null}
        <SeloDeEstado tom={tom}>{TEXTO_DO_JOB[grupo.estado]}</SeloDeEstado>
        <button
          type="button"
          className="btn btn-icon"
          style={{ width: 24, height: 24, color: ativo ? 'var(--err)' : 'var(--mute)' }}
          title={
            ativo
              ? `Cancelar ${job.rotulo} — o processo para no servidor`
              : 'Tirar da lista (já terminou)'
          }
          aria-label={ativo ? 'Cancelar o job' : 'Tirar da lista'}
          onClick={() => {
            if (ativo) void cancelJob(job.id).catch(() => undefined);
            else grupo.jobs.forEach((j) => removeJob(j.id));
          }}
        >
          <Icon name={ativo ? 'ban' : 'x'} size={11} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--inset)' }} aria-hidden>
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${Math.max(0, Math.min(100, job.progresso))}%`,
              borderRadius: 2,
              // Progresso é estado, não ação: a barra fala a língua do selo.
              background: COR_DA_BARRA[tom],
            }}
          />
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', width: 34, textAlign: 'right' }}>
          {Math.round(job.progresso)}%
        </span>
      </div>

      {/* `erro` tem precedência sobre `etapa`: num job que falhou, "overlay
          4/7" é onde ele estava, e a mensagem é o que resolve o problema. */}
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          lineHeight: 1.45,
          color: job.erro ? 'var(--err)' : 'var(--mute)',
        }}
      >
        {job.erro || job.etapa || job.rotuloTipo}
      </span>
    </div>
  );
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
  const painel = useRef<HTMLElement>(null);
  const gatilho = useRef<Element | null>(null);
  const { grupos, jobs } = useWorkbenchQueue();

  useEffect(() => {
    if (!aberta) return;
    gatilho.current = document.activeElement;
    painel.current?.querySelector<HTMLElement>('button')?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      // ⌘J também fecha: com a gaveta aberta o teclado da casca se cala
      // (há um diálogo na tela), então o segundo ⌘J só chega aqui.
      const alternou = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j';
      if (e.key === 'Escape' || alternou) {
        // Para aqui: sem isso o Esc segue para os listeners de documento e
        // fecha o diálogo que estiver atrás (o mesmo bug da paleta na R2).
        e.preventDefault();
        e.stopPropagation();
        aoFechar();
        return;
      }
      // Armadilha de foco: sem isso o Tab passeia pela tela de trás, que
      // está inerte atrás do véu — e o operador digita no escuro.
      if (e.key !== 'Tab') return;
      const focaveis = painel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis?.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      // Devolve o foco ao botão que abriu: quem usa teclado não pode
      // reaparecer no começo do documento.
      (gatilho.current as HTMLElement | null)?.focus?.();
    };
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  const ativos = jobs.filter((j) => ehAtivo(j.estado)).length;
  const resumo =
    jobs.length === 0
      ? 'vazia'
      : `${ativos} ativo${ativos === 1 ? '' : 's'} · ${jobs.length} na lista`;

  // Sem portal: montada dentro da `.ap`, a gaveta herda tema, vidro e
  // paleta. Num portal para o <body> ela sairia branca no tema escuro.
  return (
    <div className="gaveta-raiz" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        role="presentation"
        onClick={aoFechar}
        className="gaveta-veu"
        // Sem blur: a promessa é "a tela atrás fica intacta" — escurecer
        // basta para separar, e a lista continua legível durante a consulta.
        style={{ position: 'absolute', inset: 0, background: 'rgb(8 11 18/.32)' }}
      />
      <aside
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label="Fila de processamento"
        className="gaveta-painel"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: 'min(404px, 100vw)',
          height: '100%',
          borderLeft: '1px solid var(--line)',
          background: 'var(--solid)',
          boxShadow: '-18px 0 44px rgb(8 11 18/.32)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--r2)', background: 'var(--accent-soft)', color: 'var(--accent2)', flex: 'none' }}>
            <Icon name="loader" size={13} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
            <strong style={{ fontSize: 12.5 }}>Fila de processamento</strong>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)' }}>{resumo}</span>
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={aoAbrirTelaCheia} title="Abrir a fila em tela cheia (/fila)">
            <Icon name="maximize" size={11} />
            Tela cheia
          </button>
          <button type="button" className="btn btn-icon" style={{ width: 26, height: 26 }} onClick={aoFechar} title="Fechar (Esc)" aria-label="Fechar a fila">
            <Icon name="x" size={13} />
          </button>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 11, flex: 1, minHeight: 0, overflow: 'auto' }}>
          {children ??
            (grupos.length === 0 ? (
              <p style={{ margin: 0, padding: '28px 12px', textAlign: 'center', fontSize: 12, color: 'var(--mute)' }}>
                Nada rodando agora.
              </p>
            ) : (
              grupos.map((g) => <LinhaDaFila key={g.chave} grupo={g} />)
            ))}
        </div>

        <footer style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--mute)' }}>
          <kbd>Esc</kbd> fechar
          <kbd>⌘J</kbd> abrir/fechar
          <span style={{ flex: 1 }} />
          <span>a tela atrás fica intacta</span>
        </footer>
      </aside>
    </div>
  );
}
