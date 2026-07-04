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
      // Ctrl+S ainda pode disparar (salvar) mesmo em input — Ctrl/Meta override
      if (editable && !(e.ctrlKey || e.metaKey)) return;
      const found = bindings.find((b) => matches(e, b));
      if (!found) return;
      // I-029 v2: combos como Ctrl+Z cedem ao browser dentro de inputs
      // (undo de texto), evitando comer o atalho nativo do campo.
      if (editable && found.skipInEditable) return;
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
