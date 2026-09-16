import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-599 · Os dois eixos de aparência do handoff.
//
// O protótipo expõe `tema` (claro/escuro) e `vidro` (1/0) como
// propriedades separadas, e isso é uma decisão de design, não um
// detalhe: o vidro é o MATERIAL da superfície, e desligá-lo troca
// translucidez por sólido sem mexer em nenhuma cor. Quem trabalha
// com o render aberto atrás da janela agradece — backdrop-filter
// custa composição de GPU a cada frame.
// ─────────────────────────────────────────────────────────────────

export type UpgradeTheme = 'light' | 'dark';

const THEME_KEY = 'upgrade-theme';
const GLASS_KEY = 'upgrade-glass';

function read<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key) as T | null;
    if (stored && valid.includes(stored)) return stored;
  } catch {
    // sem localStorage — usa o padrão
  }
  return fallback;
}

export function useUpgradeTheme() {
  const [theme, setTheme] = useState<UpgradeTheme>(() =>
    read(THEME_KEY, ['light', 'dark'] as const, 'light'),
  );
  const [glass, setGlass] = useState<boolean>(
    () => read(GLASS_KEY, ['1', '0'] as const, '1') === '1',
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // preferência some ao recarregar; não vale derrubar a tela por isso
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GLASS_KEY, glass ? '1' : '0');
    } catch {
      // idem
    }
  }, [glass]);

  const toggleTheme = useCallback(() => {
    setTheme((atual) => (atual === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleGlass = useCallback(() => setGlass((atual) => !atual), []);

  return { theme, setTheme, toggleTheme, glass, setGlass, toggleGlass };
}
