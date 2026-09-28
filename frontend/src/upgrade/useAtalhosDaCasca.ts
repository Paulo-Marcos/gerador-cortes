import { useEffect } from 'react';
import { acaoDaTecla } from './teclasDaCasca';
import { listaDoChrome, type Chrome, type ChromeBarra } from './UpgradeChrome';

// D-806: os atalhos de teclado da casca saíram do UpgradeShell (que passou
// de 500 linhas na D-798). A DECISÃO de cada tecla segue pura e testada em
// `teclasDaCasca`; aqui fica o lado que lê o DOM e executa.

/**
 * Há um diálogo, menu ou popover aberto? Nesse caso o teclado é dele, não da
 * casca. `[role="dialog"]` e `[role="menu"]` entram além do `aria-modal`: os
 * popovers da régua e os menus "⋯" não são modais, mas J/K trocando o corte
 * por trás de uma decisão aberta é o mesmo erro.
 */
export function overlayAberto(): boolean {
  return document.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"]') !== null;
}

/**
 * O foco está num controle que TAMBÉM decide? Só esses engolem o Enter.
 *
 * RODADA 2 · antes a pergunta era "está em qualquer botão?", e como o
 * navegador deixa o foco no botão clicado, bastava clicar um corte na lista
 * para o Enter morrer — com o ↵ ainda impresso na barra. `data-decisao` está
 * nos três botões da `ActionBar`; ponha-o também em veredito inline
 * (aprovar/rejeitar dentro do conteúdo) e o Enter não duplicará nada.
 */
function focoEmDecisao(alvo: HTMLElement | null): boolean {
  if (!alvo) return false;
  if (alvo.closest('[data-decisao]')) return true;
  // Um botão COMUM focado também é acionado pelo navegador no Enter: foco em
  // "Fire" ou "Gerar bruto" + Enter faria a ação dele E aprovaria o corte.
  // Só as linhas de lista (`data-navegacao`) — o caso que a rodada 2 quis
  // destravar — deixam o Enter com a casca.
  const controle = alvo.closest('button, a[href], [role="button"]');
  return controle != null && controle.closest('[data-navegacao]') == null;
}

/** Atalhos da casca: ⌘B recolhe o trilho, ⌘K busca, J/K trocam de item,
 *  Enter dispara a ação primária da barra. A DECISÃO mora em `teclasDaCasca`
 *  (pura e testada); aqui só se lê o DOM e se executa. */
export function useAtalhosDaCasca(
  alternarTrilho: () => void,
  abrirBusca: () => void,
  abrirFila: () => void,
  chrome: Chrome,
) {
  const atual = chrome.atual ?? listaDoChrome(chrome).atual;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const primario = chrome.barra?.primario;
      const acao = acaoDaTecla({
        tecla: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        digitando:
          alvo instanceof HTMLInputElement ||
          alvo instanceof HTMLTextAreaElement ||
          alvo instanceof HTMLSelectElement ||
          alvo?.isContentEditable === true,
        focoEmDecisao: focoEmDecisao(alvo),
        overlayAberto: overlayAberto(),
        jaTratado: e.defaultPrevented,
        primarioDisponivel:
          Boolean(primario?.onClick) && !primario?.desabilitado && !primario?.semEnter,
      });
      if (!acao) return;

      if (acao === 'trilho') alternarTrilho();
      if (acao === 'busca') abrirBusca();
      if (acao === 'fila') abrirFila();
      if (acao === 'proximo') atual?.onProximo?.();
      if (acao === 'anterior') atual?.onAnterior?.();
      if (acao === 'primario') primario?.onClick?.();
      // J/K nao chamam preventDefault: fora de campo elas nao tem acao nativa.
      // ⌘J precisa do preventDefault: no Chrome ele abre os downloads.
      if (acao === 'trilho' || acao === 'busca' || acao === 'fila' || acao === 'primario')
        e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [alternarTrilho, abrirBusca, abrirFila, atual, chrome.barra]);
}

/** Injeta o lembrete de J/K quando existe seletor e a tela não declarou o seu. */
export function barraComTeclas(barra: ChromeBarra, temSeletor: boolean): ChromeBarra {
  if (!temSeletor) return barra;
  const jaTem = barra.teclas?.some((t) => t.teclas.includes('J'));
  if (jaTem) return barra;
  return {
    ...barra,
    teclas: [{ teclas: ['J', 'K'], texto: 'trocar de corte' }, ...(barra.teclas ?? [])],
  };
}
