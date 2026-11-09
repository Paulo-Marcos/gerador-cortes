import { effectiveShortcutSpecs, shortcutCombo } from '@/shared/atalhos/shortcutsRegistry';
import { Icon } from '@/upgrade/Icon';
import { alternarModoFoco } from '@/upgrade/modoFoco';

/** O atalho em uso (com a reatribuição do usuário), para o `title`. */
function atalhoDoFoco(): string {
  const spec = effectiveShortcutSpecs().find((s) => s.id === 'bruto.modoFoco');
  return spec ? shortcutCombo(spec) : '';
}

/** D-1085 · Entra/sai do modo foco. `flutuante`: dentro do foco não sobra
 *  barra, então o botão de sair fica solto no canto, discreto. */
export function BotaoModoFoco({ ativo, flutuante = false }: { ativo: boolean; flutuante?: boolean }) {
  const rotulo = ativo ? 'Sair do modo foco' : 'Modo foco: player e onda em tela cheia';
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={ativo}
      title={`${rotulo} (${atalhoDoFoco()})`}
      onClick={alternarModoFoco}
      className={
        flutuante
          ? 'absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] opacity-60 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]'
          : 'flex h-6 w-6 flex-none items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-accent)] hover:text-[var(--wb-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]'
      }
    >
      <Icon name={ativo ? 'minimize-2' : 'maximize-2'} />
    </button>
  );
}
