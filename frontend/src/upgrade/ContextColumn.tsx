import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { TiraMini } from './telas/TiraDoCorteAp';
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
  depois,
}: {
  titulo: string;
  resumo?: string;
  padding?: string;
  /** Controle à direita do resumo (o "recolher" da coluna). */
  depois?: ReactNode;
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
      {depois}
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

/** A miniatura da linha. Sem arquivo (a limpeza apagou a capa), some: o
 *  ícone de imagem quebrada não identifica nada. */
function MiniaturaDaLinha({ thumb, dur }: { thumb: string; dur?: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return null;
  return (
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
        src={thumb}
        alt=""
        loading="lazy"
        onError={() => setQuebrou(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {dur ? (
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
          {dur}
        </span>
      ) : null}
    </span>
  );
}

/** Uma linha da lista. Compartilhada com o painel do seletor.
 *
 *  D-746: o botão de navegar e a ação da linha são IRMÃOS — botão dentro de
 *  botão não existe em HTML, e o clique no { } abriria o corte junto. */
export function LinhaDeLista({ item }: { item: ItemDeLista }) {
  return (
    <div
      className="row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        marginBottom: 2,
        border: `1px solid ${item.ativo ? 'var(--accent)' : 'transparent'}`,
        borderRadius: 'var(--r2)',
        background: item.ativo ? 'var(--accent-soft)' : 'transparent',
      }}
    >
      <button
        type="button"
        // Linha de lista só NAVEGA: com o foco nela, o Enter ainda é da casca.
        data-navegacao
        onClick={item.onClick}
        aria-current={item.ativo ? 'true' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          minWidth: 0,
          padding: 7,
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {item.thumb ? <MiniaturaDaLinha thumb={item.thumb} dur={item.dur} /> : null}
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
          {item.tira ? <TiraMini tira={item.tira} /> : null}
        </span>
        {item.tira ? null : (
          <span
            style={{ width: 7, height: 7, flex: 'none', borderRadius: 99, background: item.dot }}
            aria-hidden
          />
        )}
      </button>
      {item.acao ? (
        <button
          type="button"
          className="btn btn-icon"
          title={item.acao.titulo}
          aria-label={item.acao.titulo}
          onClick={item.acao.onClick}
          style={{ width: 24, height: 24, marginRight: 4, flex: 'none', color: 'var(--accent)' }}
        >
          <Icon name={item.acao.icone} size={12} />
        </button>
      ) : null}
    </div>
  );
}

/** D-610: a coluna recolhida vira uma tira de 36 px. A lista continua a um
 *  clique no seletor da barra superior; a tira só devolve a coluna. */
export function ColunaRecolhida({ titulo, onAbrir }: { titulo: string; onAbrir: () => void }) {
  return (
    <aside
      className="gl"
      style={{
        display: 'flex',
        flex: 'none',
        width: 36,
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        borderRight: '1px solid var(--line)',
      }}
    >
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        onClick={onAbrir}
        title={`Mostrar ${titulo.toLowerCase()}`}
        aria-label={`Mostrar ${titulo.toLowerCase()}`}
      >
        <Icon name="panel-left" size={14} />
      </button>
    </aside>
  );
}

export function ContextColumn({
  lista,
  onRecolher,
}: {
  lista: ChromeLista;
  onRecolher?: () => void;
}) {
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

      <CabecalhoDeLista
        titulo={lista.titulo}
        resumo={lista.resumo}
        depois={
          onRecolher ? (
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              onClick={onRecolher}
              title={`Recolher ${lista.titulo.toLowerCase()}`}
              aria-label={`Recolher ${lista.titulo.toLowerCase()}`}
              style={{ width: 24, height: 24, marginRight: -4 }}
            >
              <Icon name="panel-left" size={12} />
            </button>
          ) : null
        }
      />

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
