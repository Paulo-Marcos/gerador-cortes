import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { ChromeEstado } from './UpgradeChrome';
import { temaEscuro, type UpgradeTheme } from './useUpgradeTheme';

// ─────────────────────────────────────────────────────────────────
// D-877 · A ponta direita da barra superior: busca, canal, estado, fila e
// tema. Saiu do `TopBar` quando a barra passou a ceder em degraus — o
// arquivo estava no teto. Fila, tema, busca e estado nunca saem da barra;
// o que cede aqui é o texto do canal (degrau 2, `apertoDaBarra`).
// ─────────────────────────────────────────────────────────────────

type PontaDaBarraProps = {
  /** Busca com rótulo; sem isto, só o ícone. Também decide o texto longo do
   *  canal e do estado — os três cedem juntos abaixo de 1200 px. */
  buscaLarga: boolean;
  /** `false` quando a barra apertou: o canal vira só o ícone. */
  canalComTexto: boolean;
  canal?: { nome: string; handle: string };
  estado?: ChromeEstado;
  tema: UpgradeTheme;
  onAlternarTema: () => void;
  onAbrirBusca?: () => void;
  onAbrirAvisos?: () => void;
  avisosAtivos: number;
  avisoDeErro: boolean;
};

function Busca({ larga, onAbrir }: { larga: boolean; onAbrir?: () => void }) {
  if (!larga) {
    return (
      <button
        type="button"
        className="btn btn-icon"
        title="Buscar live, tela ou ação · ⌘K"
        aria-label="Buscar live, tela ou ação"
        aria-keyshortcuts="Meta+K"
        onClick={onAbrir}
        // Sem isto o ícone era espremido a 16 px antes de alguém ceder.
        style={{ flex: 'none' }}
      >
        <Icon name="search" />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="fld campo"
      onClick={onAbrir}
      style={{
        width: 240,
        flex: 'none',
        color: 'var(--dim)',
        background: 'var(--panel)',
        backdropFilter: 'var(--glass)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <Icon name="command" />
      Buscar live, tela ou ação…
      <span style={{ flex: 1 }} />
      <kbd>⌘K</kbd>
    </button>
  );
}

function ChipDoCanal({
  canal,
  texto,
}: {
  canal: { nome: string; handle: string };
  texto?: string;
}) {
  const titulo = `Canal ativo: ${canal.nome} (${canal.handle}) — é para ele que os cortes são publicados. Trocar em Canais.`;
  return (
    <Link
      to="/canais"
      className="chip"
      title={titulo}
      // Só o ícone: o nome vira o nome acessível, senão o link fica mudo.
      aria-label={texto ? undefined : `Canal ativo: ${canal.nome}`}
      style={{ flex: 'none', height: 24, maxWidth: 180, color: 'var(--ink)', textDecoration: 'none' }}
    >
      <Icon name="radio" style={{ flex: 'none', color: 'var(--mute)' }} />
      {texto ? (
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>
      ) : null}
    </Link>
  );
}

function SinoDaFila({
  ativos,
  erro,
  onAbrir,
}: {
  ativos: number;
  erro: boolean;
  onAbrir?: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-icon"
      title={
        erro
          ? 'Um job falhou — abrir a fila (⌘J)'
          : ativos > 0
            ? `${ativos} job(s) rodando — abrir a fila (⌘J)`
            : 'Abrir a fila (⌘J)'
      }
      aria-label="Abrir a fila"
      onClick={onAbrir}
      style={{ position: 'relative', flex: 'none' }}
    >
      <Icon name="bell" />
      {ativos > 0 || erro ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 7,
            height: 7,
            borderRadius: 99,
            // Estado, não ação: info rodando, erro quando algo falhou.
            background: erro ? 'var(--err)' : 'var(--info)',
          }}
        />
      ) : null}
    </button>
  );
}

export function PontaDaBarra({
  buscaLarga,
  canalComTexto,
  canal,
  estado,
  tema,
  onAlternarTema,
  onAbrirBusca,
  onAbrirAvisos,
  avisosAtivos,
  avisoDeErro,
}: PontaDaBarraProps) {
  return (
    <>
      <Busca larga={buscaLarga} onAbrir={onAbrirBusca} />

      {canal ? (
        <ChipDoCanal
          canal={canal}
          texto={canalComTexto ? (buscaLarga ? canal.nome : canal.handle) : undefined}
        />
      ) : null}

      {estado ? (
        <span
          className="chip"
          title={estado.texto}
          style={{ background: estado.bg, color: estado.cor, flex: 'none' }}
        >
          <Icon name={estado.icone} />
          {buscaLarga ? estado.texto : null}
        </span>
      ) : null}

      <SinoDaFila ativos={avisosAtivos} erro={avisoDeErro} onAbrir={onAbrirAvisos} />
      <button
        type="button"
        className="btn btn-icon"
        onClick={onAlternarTema}
        title={temaEscuro(tema) ? 'Tema claro' : 'Tema escuro'}
        aria-label={temaEscuro(tema) ? 'Tema claro' : 'Tema escuro'}
        style={{ flex: 'none' }}
      >
        <Icon name={temaEscuro(tema) ? 'sun' : 'moon'} />
      </button>
    </>
  );
}
