import { useEffect, useSyncExternalStore } from 'react';
import { overlayAberto } from '@/shared/atalhos/shortcuts';
import { aoSairDoEditor, focoVale, ligarFocoAoNavegador, storeDoFoco } from './modoFoco';

/** O foco está valendo? (o editor lê isto para esconder a coluna de trechos) */
export function useModoFocoAtivo(): boolean {
  const ativo = () => storeDoFoco.ler().ativo;
  return useSyncExternalStore(storeDoFoco.assinar, ativo, ativo);
}

/**
 * A casca é quem fica sempre montada, então é ela que mantém o foco são:
 * acompanha a tela cheia do navegador, trata o Esc quando a tela cheia foi
 * recusada e acaba com o foco ao sair da tela do editor.
 * Devolve se o foco vale AGORA.
 */
export function useModoFocoDaCasca(noEditor: boolean): boolean {
  const ativo = useModoFocoAtivo();

  useEffect(() => ligarFocoAoNavegador(document, window, overlayAberto), []);
  useEffect(() => aoSairDoEditor(noEditor), [noEditor]);

  return focoVale(storeDoFoco.ler(), noEditor) && ativo;
}
