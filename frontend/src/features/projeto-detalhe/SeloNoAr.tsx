import { Icon } from '@/components/ui/icon';

/** D-866: a etapa Publicado da trilha chega ao Workspace filtrada. O selo diz
 *  que o filtro está ligado e é ele mesmo quem o desliga. D-1149: pílula da Sala
 *  escura, no tom `ok` (é estado, não ação: nada de íris nem feixe). */
export function SeloNoAr({ total, onTirar }: { total: number; onTirar: () => void }) {
  return (
    <button
      type="button"
      data-sala=""
      onClick={onTirar}
      aria-label={`Tirar o filtro: só os no ar (${total})`}
      title="Mostrar todos os cortes"
      className="inline-flex h-7 items-center gap-1.5 rounded-pilula border border-transparent bg-ok/[.13] px-3 text-pequeno text-ok transition-colors duration-150 hover:bg-ok/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco motion-reduce:transition-none"
    >
      <Icon name="rocket" />
      Só os no ar · {total}
      <Icon name="x" />
    </button>
  );
}
