import { useEffect, useSyncExternalStore } from 'react';
import { overlayAberto } from '@/shared/atalhos/shortcuts';
import {
  aoMudarTelaCheia,
  emTelaCheia,
  escSaiDoFoco,
  focoVale,
  sairDoModoFoco,
  storeDoFoco,
} from './modoFoco';

/** O foco está valendo? (o editor lê isto para esconder a coluna de trechos) */
export function useModoFocoAtivo(): boolean {
  return useSyncExternalStore(storeDoFoco.assinar, () => storeDoFoco.ler().ativo, () => false);
}

/**
 * A casca é quem fica sempre montada, então é ela que mantém o foco são:
 * acompanha a tela cheia do navegador, trata o Esc quando a tela cheia foi
 * recusada e acaba com o foco ao sair da tela do editor.
 * Devolve se o foco vale AGORA.
 */
export function useModoFocoDaCasca(noEditor: boolean): boolean {
  const ativo = useModoFocoAtivo();

  useEffect(() => {
    const aoMudar = () => storeDoFoco.aplicar((e) => aoMudarTelaCheia(e, emTelaCheia()));
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented || overlayAberto()) return;
      if (escSaiDoFoco(storeDoFoco.ler(), emTelaCheia())) sairDoModoFoco();
    };
    document.addEventListener('fullscreenchange', aoMudar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoMudar);
      window.removeEventListener('keydown', aoTeclar);
    };
  }, []);

  useEffect(() => {
    if (!noEditor) sairDoModoFoco();
  }, [noEditor]);

  return focoVale(storeDoFoco.ler(), noEditor) && ativo;
}
