import { Icon } from './Icon';
import type { ChromeBarra } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A barra de ações fixa.
//
// Ela fica fora da área que rola, então a ação que fecha a tela —
// aprovar, renderizar, publicar — está sempre visível, não importa onde
// a pessoa esteja na página. A ordem também é fixa: lembretes de tecla à
// esquerda, depois o fiel, depois secundário → terciário → primário.
// Quem aprende a ordem uma vez a encontra em todas as telas.
//
// RODADA 2 · os três botões passam a carregar `data-decisao`. É o que a
// trava do Enter lê (`teclasDaCasca`): antes ela olhava para qualquer
// controle focado, e como o navegador deixa o foco no botão clicado,
// bastava clicar um corte na lista para o Enter morrer — com o ↵ ainda
// impresso aqui. Agora o Enter só é engolido quando o foco está num
// controle que TAMBÉM decide, que é o caso em que ele duplicaria a ação.
// ─────────────────────────────────────────────────────────────────

/**
 * D-746: o veredito editorial, à esquerda e com peso menor que o primário.
 * Antes, na Pós, "Aprovar corte" disparava o render final — um veredito
 * acionando ~20 min de GPU. Aqui ele só alterna aprovado ⇄ proposto.
 */
function Veredito({ aprovado, ocupado, onAlternar }: NonNullable<ChromeBarra['veredito']>) {
  return aprovado ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 28,
          padding: '0 9px',
          border: '1px solid var(--ok)',
          borderRadius: 'var(--r2)',
          background: 'var(--ok-soft)',
          color: 'var(--ok)',
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <Icon name="check" size={13} />
        Aprovado
      </span>
      <button
        type="button"
        className="btn"
        data-decisao
        disabled={ocupado}
        onClick={onAlternar}
        title="Devolver o corte para proposto — não apaga nada"
        style={{ color: 'var(--mute)', borderColor: 'transparent', background: 'none' }}
      >
        <Icon name="undo-2" size={13} />
        Devolver
      </button>
    </span>
  ) : (
    <button
      type="button"
      className="btn"
      data-decisao
      disabled={ocupado}
      onClick={onAlternar}
      title="Aprovar o corte — não renderiza nada"
      style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}
    >
      <Icon name="check" size={13} />
      Aprovar corte
    </button>
  );
}

export function ActionBar({ barra }: { barra: ChromeBarra }) {
  return (
    <div
      className="gl"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        flex: 'none',
        padding: '10px 18px',
        borderTop: '1px solid var(--line)',
      }}
    >
      {barra.extra}
      {barra.teclas?.map((t) => (
        <span
          key={t.texto}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            color: 'var(--mute)',
          }}
        >
          {t.teclas.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
          {t.texto}
        </span>
      ))}

      {barra.veredito ? <Veredito {...barra.veredito} /> : null}
      <div style={{ flex: 1, minWidth: 8 }} />

      {barra.alternancias?.map((a) => (
        <span key={a.texto} style={{ display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            className="btn"
            data-decisao
            aria-pressed={a.ativo}
            title={a.titulo}
            disabled={a.ocupado}
            onClick={a.onClick}
            style={
              a.ativo
                ? { borderColor: a.cor, background: a.corSuave, color: a.cor }
                : { color: 'var(--mute)' }
            }
          >
            <Icon name={a.icone} size={13} />
            {a.texto}
          </button>
          {a.ativo && a.editar ? (
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              data-decisao
              title={a.editar.titulo}
              aria-label={a.editar.titulo}
              onClick={a.editar.onClick}
            >
              <Icon name="pencil" size={12} />
            </button>
          ) : null}
        </span>
      ))}
      {barra.alternancias?.length ? (
        <span style={{ width: 1, height: 20, background: 'var(--line)' }} aria-hidden />
      ) : null}

      {barra.secundario ? (
        <button
          type="button"
          className="btn"
          data-decisao
          style={{ color: 'var(--mute)' }}
          onClick={barra.secundario.onClick}
        >
          <Icon name={barra.secundario.icone} size={13} />
          {barra.secundario.texto}
        </button>
      ) : null}

      {barra.terciario ? (
        <button
          type="button"
          className="btn btn-icon"
          data-decisao
          title={barra.terciario.titulo}
          aria-label={barra.terciario.titulo}
          onClick={barra.terciario.onClick}
        >
          <Icon name={barra.terciario.icone} size={13} />
        </button>
      ) : null}

      {barra.primario.desabilitado && barra.primario.motivo ? (
        <span
          id="motivo-do-primario"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            maxWidth: 320,
            fontSize: 11.5,
            color: 'var(--warn)',
          }}
        >
          <Icon name="ban" size={12} style={{ flex: 'none' }} />
          {barra.primario.motivo}
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-pri"
        data-decisao
        aria-keyshortcuts={
          barra.primario.desabilitado || barra.primario.semEnter ? undefined : 'Enter'
        }
        aria-describedby={
          barra.primario.desabilitado && barra.primario.motivo ? 'motivo-do-primario' : undefined
        }
        onClick={barra.primario.onClick}
        disabled={barra.primario.desabilitado}
      >
        <Icon name={barra.primario.icone} size={13} />
        {barra.primario.texto}
        {barra.primario.desabilitado || barra.primario.semEnter ? null : (
          <kbd
            style={{
              background: 'rgb(255 255 255/.2)',
              borderColor: 'transparent',
              color: 'inherit',
            }}
          >
            ↵
          </kbd>
        )}
      </button>
    </div>
  );
}
