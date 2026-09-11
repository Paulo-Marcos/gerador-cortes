import { useArranjo, useArranjoOps } from '@/hooks/useArranjo';
import { BlocosPanel } from './BlocosPanel';

/**
 * D-576 — casca de dados da aba "Ordem".
 *
 * Existe para que o `RightTabsPanel` (travado por três features) ganhasse
 * apenas a linha que monta a aba, e não o bloco de hooks, mutações e estado de
 * carregamento. O painel de baixo continua burro — só recebe dados e dispara
 * callbacks —, que é a divisão que o projeto usa no resto do editor.
 */
export function BlocosTab({
  corteId,
  projetoId,
  pontoSeg,
  onSeek,
}: {
  corteId: string;
  projetoId?: string;
  /** Ponteiro do player, em segundos absolutos da live. */
  pontoSeg: number;
  onSeek: (seg: number) => void;
}) {
  const arranjo = useArranjo(corteId);
  const ops = useArranjoOps(corteId, projetoId);

  return (
    <BlocosPanel
      arranjo={arranjo.data}
      pontoSeg={pontoSeg}
      onSeek={onSeek}
      onDividir={(ponto) => ops.dividir.mutate({ ponto_seg: ponto })}
      onMover={(de, para) => ops.mover.mutate({ de_indice: de, para_indice: para })}
      onFundir={(indice) => ops.fundir.mutate({ indice })}
      onRestaurar={() => ops.restaurar.mutate()}
      pendente={arranjo.isFetching || ops.pendente}
    />
  );
}
