import { Icon } from './Icon';
import type { ChromeContexto, EtapaProjeto } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A coluna de contexto (250 px).
//
// Ela só existe nas telas de bancada, e o motivo é econômico: nelas a
// pessoa trabalha item a item e precisa ver a fila sem sair do que
// está fazendo. Nas telas de lista a fila JÁ é o conteúdo, e repetir
// a lista ao lado da lista seria ruído caro.
//
// RODADA 1 · quem decide se ela aparece é a CASCA, por medida de
// janela (`UpgradeShell`), e não mais a regra `.ctx{display:none}` do
// CSS. A diferença importa: com `display:none` a identidade da live e
// a esteira clicável simplesmente evaporavam abaixo de 1240 px, sem
// substituto. Agora a casca sabe que a coluna não está lá e manda as
// duas peças para o painel do seletor — as duas moram aqui e são
// exportadas para isso.
// ─────────────────────────────────────────────────────────────────

const ESTADO_ETAPA = {
  feito: { bg: 'var(--ok-soft)', cor: 'var(--ok)', borda: 'var(--line)' },
  agora: { bg: 'var(--accent)', cor: 'var(--on-accent)', borda: 'transparent' },
  todo: { bg: 'var(--inset)', cor: 'var(--dim)', borda: 'var(--line)' },
} satisfies Record<EtapaProjeto['estado'], { bg: string; cor: string; borda: string }>;

/** Miniatura + nome da live. Reaproveitada no painel do seletor. */
export function IdentidadeDaLive({
  titulo,
  sub,
  thumb,
}: {
  titulo: string;
  sub?: string;
  thumb?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
      <span
        style={{
          width: 44,
          height: 26,
          flex: 'none',
          borderRadius: 'var(--r1)',
          overflow: 'hidden',
          // Sem thumb real ainda: cinza de ausência, não gradiente de
          // protótipo. Azul-bonito em 14 linhas iguais não identifica nada.
          background: 'var(--inset)',
        }}
        aria-hidden
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {titulo}
        </span>
        {sub ? (
          <span
            style={{
              display: 'block',
              fontSize: 11,
              color: 'var(--mute)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** A esteira da live em uma linha de botões de 24 px. */
export function EtapasEmLinha({ etapas }: { etapas: EtapaProjeto[] }) {
  if (etapas.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {etapas.map((e) => {
        const tom = ESTADO_ETAPA[e.estado];
        return (
          <button
            key={e.titulo}
            type="button"
            onClick={e.onClick}
            title={e.titulo}
            aria-label={e.titulo}
            aria-current={e.estado === 'agora' ? 'step' : undefined}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '100%',
              height: 24,
              border: `1px solid ${tom.borda}`,
              borderRadius: 'var(--r1)',
              background: tom.bg,
              color: tom.cor,
              cursor: e.onClick ? 'pointer' : 'default',
            }}
          >
            <Icon name={e.icone} size={12} />
          </button>
        );
      })}
    </div>
  );
}

/** Uma linha da lista de cortes. Compartilhada com o painel do seletor. */
export function LinhaDeContexto({
  item,
}: {
  item: ChromeContexto['itens'][number];
}) {
  return (
    <button
      type="button"
      className="row"
      onClick={item.onClick}
      aria-current={item.ativo ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: 7,
        border: `1px solid ${item.ativo ? 'var(--accent)' : 'transparent'}`,
        borderRadius: 'var(--r2)',
        background: item.ativo ? 'var(--accent-soft)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        marginBottom: 2,
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 38,
          height: 22,
          flex: 'none',
          borderRadius: 'var(--r1)',
          overflow: 'hidden',
          background: 'var(--inset)',
        }}
      >
        {item.thumb ? (
          <img
            src={item.thumb}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        {item.dur ? (
          <span
            style={{
              position: 'absolute',
              inset: 'auto 1px 1px auto',
              padding: '0 2px',
              borderRadius: 2,
              background: 'rgb(0 0 0/.55)',
              fontFamily: 'var(--mono)',
              fontSize: 8,
              color: '#fff',
            }}
          >
            {item.dur}
          </span>
        ) : null}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 11.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.titulo}
        </span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--mute)',
          }}
        >
          {item.legenda}
        </span>
      </span>
      <span
        style={{ width: 7, height: 7, flex: 'none', borderRadius: 99, background: item.dot }}
        aria-hidden
      />
    </button>
  );
}

export function ContextColumn({ contexto }: { contexto: ChromeContexto }) {
  return (
    <aside
      className="gl ctx"
      style={{
        display: 'flex',
        flex: 'none',
        width: 250,
        flexDirection: 'column',
        borderRight: '1px solid var(--line)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          borderBottom: '1px solid var(--line2)',
        }}
      >
        <IdentidadeDaLive titulo={contexto.titulo} sub={contexto.sub} thumb={contexto.thumb} />
        {contexto.etapas?.length ? <EtapasEmLinha etapas={contexto.etapas} /> : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '9px 12px',
          borderBottom: '1px solid var(--line2)',
        }}
      >
        <span className="lbl">{contexto.listaTitulo}</span>
        <span style={{ flex: 1 }} />
        {contexto.listaResumo ? (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>
            {contexto.listaResumo}
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        {contexto.itens.map((c) => (
          <LinhaDeContexto key={c.id} item={c} />
        ))}
      </div>

      {contexto.acao ? (
        <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line2)' }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={contexto.acao.onClick}
          >
            <Icon name="plus" size={12} />
            {contexto.acao.texto}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
