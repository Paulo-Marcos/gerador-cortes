import { Icon } from './Icon';
import type { ChromeLista, ItemDeLista } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A coluna de contexto (250 px).
//
// Ela só existe nas telas de bancada, e o motivo é econômico: nelas a
// pessoa trabalha item a item e precisa ver a fila sem sair do que está
// fazendo. Nas telas de lista a fila JÁ é o conteúdo, e repetir a lista
// ao lado da lista seria ruído caro.
//
// Quem decide se ela aparece é a CASCA, por medida de janela
// (`medidas.ts`). Quando não cabe, as mesmas peças vão para o painel do
// seletor — por isso elas moram aqui e são exportadas.
//
// RODADA 2 · três coisas saíram:
//   · a esteira da live (virou a fita de `FitaDaLive`, um lugar só);
//   · a caixa de miniatura quando não há miniatura — eram 14 retângulos
//     cinza idênticos gastando 38 px de largura para não dizer nada;
//   · o contrato duplo: agora entra UMA `lista`, a mesma que o painel
//     do seletor recebe.
// ─────────────────────────────────────────────────────────────────

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
      {thumb ? (
        <span
          style={{
            width: 44,
            height: 26,
            flex: 'none',
            borderRadius: 'var(--r1)',
            overflow: 'hidden',
            background: 'var(--inset)',
          }}
          aria-hidden
        >
          <img
            src={thumb}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </span>
      ) : null}
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

/** Título da lista + resumo em números. Igual nos dois lugares. */
export function CabecalhoDeLista({
  titulo,
  resumo,
  padding = '9px 12px',
}: {
  titulo: string;
  resumo?: string;
  padding?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding,
        borderBottom: '1px solid var(--line2)',
      }}
    >
      <span className="lbl">{titulo}</span>
      <span style={{ flex: 1 }} />
      {resumo ? (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
          {resumo}
        </span>
      ) : null}
    </div>
  );
}

/** Filtros da lista, quando a tela os declara. */
export function FiltrosDaLista({ filtros }: { filtros: NonNullable<ChromeLista['filtros']> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '9px 11px' }}>
      {filtros.map((f) => (
        <button
          key={f.texto}
          type="button"
          onClick={f.onClick}
          aria-pressed={f.ativo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 24,
            padding: '0 8px',
            border: `1px solid ${f.ativo ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 'var(--r1)',
            background: f.ativo ? 'var(--accent-soft)' : 'var(--panel)',
            color: f.ativo ? 'var(--accent2)' : 'var(--mute)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {f.texto}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.75 }}>{f.n}</span>
        </button>
      ))}
    </div>
  );
}

/** Uma linha da lista. Compartilhada com o painel do seletor. */
export function LinhaDeLista({ item }: { item: ItemDeLista }) {
  return (
    <button
      type="button"
      className="row"
      // Linha de lista só NAVEGA: com o foco nela, o Enter ainda é da casca.
      data-navegacao
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
      {item.thumb ? (
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
          <img
            src={item.thumb}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {item.dur ? (
            <span
              style={{
                position: 'absolute',
                inset: 'auto 1px 1px auto',
                padding: '0 2px',
                borderRadius: 2,
                background: 'rgb(0 0 0/.55)',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: '#fff',
              }}
            >
              {item.dur}
            </span>
          ) : null}
        </span>
      ) : null}
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
        {item.legenda || item.dur ? (
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--mute)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {/* Sem miniatura, a duração perde o selo do canto e vem para a
                legenda: ela é informação, não enfeite da imagem. */}
            {[item.legenda, item.thumb ? null : item.dur].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
      <span
        style={{ width: 7, height: 7, flex: 'none', borderRadius: 99, background: item.dot }}
        aria-hidden
      />
    </button>
  );
}

export function ContextColumn({ lista }: { lista: ChromeLista }) {
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
      {lista.cabecalho ? (
        <div style={{ padding: 12, borderBottom: '1px solid var(--line2)' }}>
          <IdentidadeDaLive
            titulo={lista.cabecalho.titulo}
            sub={lista.cabecalho.sub}
            thumb={lista.cabecalho.thumb}
          />
        </div>
      ) : null}

      <CabecalhoDeLista titulo={lista.titulo} resumo={lista.resumo} />

      {lista.filtros?.length ? <FiltrosDaLista filtros={lista.filtros} /> : null}

      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        {lista.itens.map((c) => (
          <LinhaDeLista key={c.id} item={c} />
        ))}
      </div>

      {lista.acao ? (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 12px',
            borderTop: '1px solid var(--line2)',
          }}
        >
          <button
            type="button"
            className="btn"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={lista.acao.onClick}
          >
            <Icon name="plus" size={12} />
            {lista.acao.texto}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
