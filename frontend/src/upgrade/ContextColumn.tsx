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
// Abaixo de 1240 px ela some (regra `.ctx` no upgrade.css): numa
// janela estreita, 250 px de contexto custam mais do que valem.
// ─────────────────────────────────────────────────────────────────

const ESTADO_ETAPA = {
  feito: { bg: 'var(--ok-soft)', cor: 'var(--ok)', borda: 'var(--line)' },
  agora: { bg: 'var(--accent)', cor: 'var(--on-accent)', borda: 'transparent' },
  todo: { bg: 'var(--inset)', cor: 'var(--dim)', borda: 'var(--line)' },
} satisfies Record<EtapaProjeto['estado'], { bg: string; cor: string; borda: string }>;

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span
            style={{
              width: 44,
              height: 26,
              flex: 'none',
              borderRadius: 'var(--r1)',
              background: 'linear-gradient(135deg,oklch(0.62 0.06 250),oklch(0.34 0.05 250))',
            }}
            aria-hidden
          />
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
              {contexto.titulo}
            </span>
            {contexto.sub ? (
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
                {contexto.sub}
              </span>
            ) : null}
          </span>
        </div>

        {contexto.etapas?.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {contexto.etapas.map((e) => {
              const tom = ESTADO_ETAPA[e.estado];
              return (
                <button
                  key={e.titulo}
                  type="button"
                  onClick={e.onClick}
                  title={e.titulo}
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
        ) : null}
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
          <button
            key={c.id}
            type="button"
            className="row"
            onClick={c.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: 7,
              border: `1px solid ${c.ativo ? 'var(--accent)' : 'transparent'}`,
              borderRadius: 'var(--r2)',
              background: c.ativo ? 'var(--accent-soft)' : 'transparent',
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
                background: 'linear-gradient(135deg,oklch(0.55 0.05 250),oklch(0.3 0.04 250))',
              }}
            >
              {c.dur ? (
                <span
                  style={{
                    position: 'absolute',
                    inset: 'auto 1px 1px auto',
                    fontFamily: 'var(--mono)',
                    fontSize: 8,
                    color: '#fff',
                  }}
                >
                  {c.dur}
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
                {c.titulo}
              </span>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--mute)',
                }}
              >
                {c.legenda}
              </span>
            </span>
            <span
              style={{ width: 7, height: 7, flex: 'none', borderRadius: 99, background: c.dot }}
              aria-hidden
            />
          </button>
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
