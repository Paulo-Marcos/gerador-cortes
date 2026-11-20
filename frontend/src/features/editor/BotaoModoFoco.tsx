import { effectiveShortcutSpecs, shortcutCombo } from '@/shared/atalhos/shortcutsRegistry';
import { Icon } from '@/upgrade/Icon';
import { alternarModoFoco } from '@/upgrade/modoFoco';
import { FERRAMENTA_ICONE } from './salaDoEditor';

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
      data-sala=""
      className={
        flutuante
          ? `absolute right-3 top-3 z-10 opacity-60 hover:opacity-100 focus-visible:opacity-100 ${FERRAMENTA_ICONE} bg-painel-solido`
          : FERRAMENTA_ICONE
      }
    >
      <Icon name={ativo ? 'minimize-2' : 'maximize-2'} />
    </button>
  );
}
