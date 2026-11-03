import { useCallback } from 'react';
import type { useAtualizarCorte } from '@/features/editor/useCortes';
import type { CenaRemotion, CenasRemotionPayload } from '@/types/models';
import { useSalvarAoSair } from '../useSalvarAoSair';

interface Opcoes {
  atualizar: ReturnType<typeof useAtualizarCorte>;
  formato?: string;
  paleta?: Record<string, string>;
  cenas: CenaRemotion[];
  dirty: boolean;
  setDirty: (sujo: boolean) => void;
}

/**
 * O salvar do painel de cenas, e o salvar ao sair da Pós (D-1036): trocar de
 * corte com cena sem salvar a gravava antes de sair; a tela nova nasce zerada.
 */
export function useGravarCenas({ atualizar, formato, paleta, cenas, dirty, setDirty }: Opcoes) {
  const gravar = useCallback(() => {
    const payload: CenasRemotionPayload = {
      ...(formato ? { formato } : {}),
      ...(paleta ? { paleta } : {}),
      cenas,
    };
    return atualizar.mutateAsync({ cenas_remotion: payload }).then(() => setDirty(false));
  }, [atualizar, cenas, formato, paleta, setDirty]);

  useSalvarAoSair({
    sujo: dirty,
    salvar: gravar,
    aoResolver: () => setDirty(false),
    avisoDeSucesso: 'Cenas salvas antes de sair.',
  });

  // Como antes (`mutate`): a falha deixa o painel sujo; só não vira rejeição solta.
  return useCallback(() => void gravar().catch(() => undefined), [gravar]);
}
