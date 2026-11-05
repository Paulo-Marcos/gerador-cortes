import { Link } from 'react-router-dom';
import { Icon } from '@/upgrade/Icon';
import { useFires } from './useFires';

// D-1051: o corte e os shorts não se conheciam. Da linha do corte e da Revisão não
// havia caminho para os shorts dele. O rejeitado fica de fora da conta: é decisão
// tomada, não short do corte.

export function ShortsDesteCorte({ corteId }: { corteId: string }) {
  const contagem = useFires().data?.fires.find((f) => f.corte_id === corteId)?.shorts;
  const total = contagem ? contagem.total - contagem.rejeitado : 0;
  return (
    <Link
      to={`/shorts/${corteId}`}
      title="Marcado como fire"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flex: 'none',
        fontSize: 12,
        whiteSpace: 'nowrap',
        color: 'var(--accent)',
      }}
    >
      <Icon name="flame" />
      {total > 0 ? `Shorts deste corte (${total})` : 'Shorts deste corte'}
    </Link>
  );
}
