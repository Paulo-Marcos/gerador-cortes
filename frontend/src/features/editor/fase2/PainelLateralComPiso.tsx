import type { ReactNode } from 'react';
import { Panel } from 'react-resizable-panels';
import { usePisoDoPainelLateral } from './pisoDoPainelLateral';

/** O painel lateral da Pós (abas Cenas e Layout), com o piso em px da D-1077.
 *  O `id` fixo deixa a chave do layout salvo independente do mínimo. */
export function PainelLateralComPiso({ grupoId, children }: { grupoId: string; children: ReactNode }) {
  const piso = usePisoDoPainelLateral(grupoId);
  return (
    <Panel id="editor-fase2-lateral" defaultSize={30} minSize={piso} order={2}>
      {children}
    </Panel>
  );
}
