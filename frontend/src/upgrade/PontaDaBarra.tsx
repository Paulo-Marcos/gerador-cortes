import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import type { ChromeEstado } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-877 · A ponta direita da linha do topo.
//
// D-1137 (E-069 H-13): a barra superior deixou de existir (DIRECAO §7.0) e a
// ponta ficou com o que é da tela: o estado ("salvo", "salvando…") e a busca.
// O canal foi para o trilho, o sino virou o item "Fila de render" do trilho e o
// sol/lua foi para Configurações › Aparência. A busca nunca sai e não encolhe.
// ─────────────────────────────────────────────────────────────────

const ROTULO_DA_BUSCA = 'Buscar live, tela ou ação';
const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

/** A busca do Ctrl K: em pílula no cabeçalho, em ícone na linha do topo. */
export function BotaoDeBusca({ larga, onAbrir }: { larga: boolean; onAbrir?: () => void }) {
  if (!larga) {
    return (
      <button
        type="button"
        title={`${ROTULO_DA_BUSCA} · Ctrl K`}
        aria-label={ROTULO_DA_BUSCA}
        aria-keyshortcuts="Control+K"
        onClick={onAbrir}
        className={`inline-grid size-[38px] flex-none place-items-center rounded-pilula border border-fio-2 bg-vidro-2 text-fg-2 shadow-topo hover:bg-vidro-3 hover:text-fg ${FOCO}`}
      >
        <Icon name="search" size={16} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-keyshortcuts="Control+K"
      className={`flex h-campo w-[260px] flex-none items-center gap-2 rounded-pilula border border-campo bg-poco px-4 text-left text-corpo text-fg-3 hover:border-fg/[.62] ${FOCO}`}
    >
      <Icon name="search" size={16} className="flex-none" />
      <span className="min-w-0 flex-1 truncate">{ROTULO_DA_BUSCA}…</span>
      <kbd className="flex-none">Ctrl K</kbd>
    </button>
  );
}

/** O estado da tela: o ícone sempre, o texto só quando há folga. */
export function ChipDeEstado({ estado, comTexto }: { estado: ChromeEstado; comTexto: boolean }) {
  // A cor vem da tela (`ChromeEstado`): entra por variável, não por estilo solto.
  const cor = { '--estado': estado.cor, '--estado-fundo': estado.bg } as CSSProperties;
  return (
    <span
      title={estado.texto}
      style={cor}
      className="inline-flex h-7 flex-none items-center gap-1.5 rounded-pilula bg-[var(--estado-fundo)] px-2.5 text-pequeno font-semibold text-[var(--estado)]"
    >
      <Icon name={estado.icone} />
      {comTexto ? estado.texto : null}
    </span>
  );
}

export function PontaDaBarra({
  estado,
  comTexto,
  onAbrirBusca,
}: {
  estado?: ChromeEstado;
  /** Com folga na janela o estado mostra o texto, não só o ícone. */
  comTexto: boolean;
  onAbrirBusca?: () => void;
}) {
  return (
    <>
      {estado ? <ChipDeEstado estado={estado} comTexto={comTexto} /> : null}
      <BotaoDeBusca larga={false} onAbrir={onAbrirBusca} />
    </>
  );
}
