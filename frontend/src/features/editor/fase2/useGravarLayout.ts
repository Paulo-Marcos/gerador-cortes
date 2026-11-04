import { useCallback, type MutableRefObject } from 'react';
import { useToast } from '@/components/ui/toaster';
import { normalizeYoutubeLayout, type YoutubeLayout } from '@/shared/palco/youtubeLayout';
import type { Corte } from '@/types/models';
import { useSalvarAoSair } from '../useSalvarAoSair';

interface Opcoes {
  draft: YoutubeLayout;
  dirty: boolean;
  /** As chaves que o painel mudou desde o último save (D-741). */
  mudadasRef: MutableRefObject<Set<string>>;
  setDirty: (sujo: boolean) => void;
  gravarNoCorte: (corpo: Partial<Corte>) => Promise<unknown>;
}

/**
 * O salvar do painel de layout, e o salvar ao sair da Pós (D-1036): trocar de
 * corte com o layout sem salvar o gravava antes de sair; a tela nova nasce zerada.
 */
export function useGravarLayout({ draft, dirty, mudadasRef, setDirty, gravarNoCorte }: Opcoes) {
  const { notify } = useToast();
  // D-741: manda só as chaves que este painel mudou; mandar o layout resolvido
  // inteiro gravava os padrões no corte, e ele parava de herdar (RN-10).
  const gravar = useCallback(() => {
    const valores = normalizeYoutubeLayout(draft) as unknown as Record<string, unknown>;
    const mudancas = Object.fromEntries(
      [...mudadasRef.current].map((chave) => [chave, valores[chave] ?? null]),
    );
    return gravarNoCorte({ layout_youtube: mudancas } as Partial<Corte>).then(() => {
      mudadasRef.current = new Set();
      setDirty(false);
    });
  }, [draft, gravarNoCorte, mudadasRef, setDirty]);

  const save = useCallback(() => {
    gravar().then(
      () => notify('Layout YouTube salvo.', { tone: 'success' }),
      (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao salvar layout.', { tone: 'error' });
      },
    );
  }, [gravar, notify]);

  useSalvarAoSair({
    sujo: dirty,
    salvar: gravar,
    aoResolver: () => {
      mudadasRef.current = new Set();
      setDirty(false);
    },
    avisoDeSucesso: 'Layout YouTube salvo antes de sair.',
  });
  return save;
}
