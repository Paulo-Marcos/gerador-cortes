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

      <div style={{ flex: 1, minWidth: 8 }} />

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

      <button
        type="button"
        className="btn btn-pri"
        data-decisao
        aria-keyshortcuts={barra.primario.desabilitado ? undefined : 'Enter'}
        onClick={barra.primario.onClick}
        disabled={barra.primario.desabilitado}
      >
        <Icon name={barra.primario.icone} size={13} />
        {barra.primario.texto}
        {barra.primario.desabilitado ? null : (
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
