import { useEffect } from 'react';

export interface ShortcutBinding {
  key: string;
  /** Tecla modificadora ctrl/meta. Se 'any', aceita ctrl OU meta (Mac). */
  mod?: 'ctrl' | 'shift' | 'alt' | 'ctrl+alt' | 'any';
  description: string;
  group: 'player' | 'navegacao' | 'edicao' | 'global';
  action: () => void;
  /**
   * Quando true, o atalho NAO dispara se o foco estiver num input/textarea/
   * contenteditable. Use para combos que tambem sao padrao de texto (Ctrl+Z
   * undo, Ctrl+Y redo etc.) e que devem ceder ao browser dentro de campos.
   */
  skipInEditable?: boolean;
  /**
   * D-887: com diálogo, menu ou popover aberto, a tecla sem Ctrl/Meta é dele
   * e o atalho se cala. `true` o mantém vivo — só para o atalho que abre e
   * fecha o PRÓPRIO modal; a ação decide o que fazer diante de outro overlay.
   */
  valeComModal?: boolean;
}

/**
 * Há um diálogo, menu ou popover aberto? Nesse caso o teclado é dele, não de
 * quem está por trás. `[role="dialog"]` e `[role="menu"]` entram além do
 * `aria-modal`: os popovers da régua e os menus "⋯" não são modais, mas uma
 * tecla agindo por trás de uma decisão aberta é o mesmo erro.
 */
export function overlayAberto(): boolean {
  return document.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"]') !== null;
}

function matches(e: KeyboardEvent, b: ShortcutBinding): boolean {
  const key = b.key.toLowerCase();
  const keyMatchesByKey = e.key.toLowerCase() === key;
  // Fallback por e.code para letras simples: layouts BR-ABNT2 reportam e.key
  // diferente quando AltGr (Ctrl+Alt) esta pressionado, mas e.code permanece estavel.
  const keyMatchesByCode =
    key.length === 1 && /[a-z]/.test(key) && e.code === `Key${key.toUpperCase()}`;
  if (!keyMatchesByKey && !keyMatchesByCode) return false;
  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  if (b.mod === 'ctrl' || b.mod === 'any') return ctrlOrMeta && !e.shiftKey && !e.altKey;
  if (b.mod === 'ctrl+alt') return ctrlOrMeta && e.altKey && !e.shiftKey;
  if (b.mod === 'shift') return e.shiftKey && !ctrlOrMeta && !e.altKey;
  if (b.mod === 'alt') return e.altKey && !ctrlOrMeta && !e.shiftKey;
  return !ctrlOrMeta && !e.shiftKey && !e.altKey;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

/** Hook global que escuta Keydown e dispara ações registradas. */
export function useShortcuts(bindings: ShortcutBinding[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target);
      const comando = e.ctrlKey || e.metaKey;
      // Ctrl+S ainda pode disparar (salvar) mesmo em input — Ctrl/Meta override
      if (editable && !comando) return;
      const found = bindings.find((b) => matches(e, b));
      if (!found) return;
      // I-029 v2: combos como Ctrl+Z cedem ao browser dentro de inputs
      // (undo de texto), evitando comer o atalho nativo do campo.
      if (editable && found.skipInEditable) return;
      // D-887: com overlay aberto, a tecla sem Ctrl/Meta é dele — como num
      // campo. Sem esta guarda, A aprovava o corte de trás com o porquê
      // aberto e o espaço num botão do modal tocava o vídeo. O comando
      // (Ctrl+S) segue: o modificador já diz que a tecla não é do modal.
      if (!comando && !found.valeComModal && overlayAberto()) return;
      e.preventDefault();
      found.action();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bindings, enabled]);
}

/** Formata o atalho para exibição em UI (Ctrl+S, Space, etc). */
export function formatShortcut(b: ShortcutBinding): string {
  const parts: string[] = [];
  if (b.mod === 'ctrl' || b.mod === 'any') parts.push('Ctrl');
  if (b.mod === 'ctrl+alt') parts.push('Ctrl', 'Alt');
  if (b.mod === 'shift') parts.push('Shift');
  if (b.mod === 'alt') parts.push('Alt');
  let label = b.key;
  if (label === ' ') label = 'Space';
  else if (label.length === 1) label = label.toUpperCase();
  parts.push(label);
  return parts.join('+');
}
