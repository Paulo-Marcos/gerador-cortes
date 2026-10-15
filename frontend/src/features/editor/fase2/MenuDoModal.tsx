import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/upgrade/Icon';

// D-927: o modal de posição em grupos. Um menu na coluna da esquerda troca o
// grupo de ajustes, e a prévia fica parada à direita — nada de rolar para ver
// o efeito do que se mexe.

export type GrupoDoModal = 'presets' | 'telas' | 'fundo' | 'cabecalho' | 'placa' | 'cards';

const ROTULOS: Record<GrupoDoModal, { nome: string; icone: IconName }> = {
  presets: { nome: 'Presets', icone: 'bookmark' },
  telas: { nome: 'Telas', icone: 'monitor' },
  fundo: { nome: 'Fundo', icone: 'image' },
  cabecalho: { nome: 'Cabeçalho', icone: 'at-sign' },
  placa: { nome: 'Placa', icone: 'tag' },
  cards: { nome: 'Cards', icone: 'layers' },
};

/** Os grupos que existem no estilo: o cabeçalho só existe no limpo. */
export function gruposDoModal(estilo: 'atual' | 'limpo'): GrupoDoModal[] {
  return estilo === 'limpo'
    ? ['presets', 'telas', 'fundo', 'cabecalho', 'placa', 'cards']
    : ['presets', 'telas', 'fundo', 'placa', 'cards'];
}

export function MenuDoModal({
  grupos,
  ativo,
  onEscolher,
}: {
  grupos: GrupoDoModal[];
  ativo: GrupoDoModal;
  onEscolher: (grupo: GrupoDoModal) => void;
}) {
  return (
    <nav aria-label="Grupos de ajustes" className="flex flex-col gap-1 border-r border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-2">
      {grupos.map((grupo) => (
        <button
          key={grupo}
          type="button"
          aria-current={ativo === grupo ? 'page' : undefined}
          onClick={() => onEscolher(grupo)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-[var(--radius-sm)] px-1 py-2 text-[11px] font-semibold transition-colors',
            ativo === grupo
              ? 'bg-[var(--sel-bg)] text-[var(--sel-ink)]'
              : 'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
          )}
        >
          <Icon name={ROTULOS[grupo].icone} size={20} />
          {ROTULOS[grupo].nome}
        </button>
      ))}
    </nav>
  );
}
