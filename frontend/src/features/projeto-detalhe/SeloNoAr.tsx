import { Icon } from '@/upgrade/Icon';

/** D-866: a etapa Publicado da trilha chega ao Workspace filtrada. O selo diz
 *  que o filtro está ligado e é ele mesmo quem o desliga. */
export function SeloNoAr({ total, onTirar }: { total: number; onTirar: () => void }) {
  return (
    <button
      type="button"
      className="chip"
      onClick={onTirar}
      aria-label={`Tirar o filtro: só os no ar (${total})`}
      title="Mostrar todos os cortes"
      style={{
        height: 24,
        border: 0,
        background: 'var(--ok-soft)',
        color: 'var(--ok)',
        cursor: 'pointer',
      }}
    >
      <Icon name="rocket" />
      Só os no ar · {total}
      <Icon name="x" />
    </button>
  );
}
