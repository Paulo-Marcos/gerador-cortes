import { useCallback, useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-599 · Os dois eixos de aparência do handoff.
//
// O protótipo expõe `tema` (claro/escuro) e `vidro` (1/0) como
// propriedades separadas, e isso é uma decisão de design, não um
// detalhe: o vidro é o MATERIAL da superfície, e desligá-lo troca
// translucidez por sólido sem mexer em nenhuma cor. Quem trabalha
// com o render aberto atrás da janela agradece — backdrop-filter
// custa composição de GPU a cada frame.
//
// A preferência mora num store de módulo, e não em `useState`: ela
// é lida em mais de um lugar ao mesmo tempo (a casca que pinta e a
// tela de Configurações que troca). Com estado local cada leitor
// teria a sua cópia, e mudar o tema nas Configurações só apareceria
// na casca depois de recarregar a página.
// ─────────────────────────────────────────────────────────────────

export type UpgradeTheme = 'light' | 'dark';

const THEME_KEY = 'upgrade-theme';
const GLASS_KEY = 'upgrade-glass';

type Aparencia = { theme: UpgradeTheme; glass: boolean };

function lerDoArmazenamento(): Aparencia {
  let theme: UpgradeTheme = 'light';
  let glass = true;
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') theme = t;
    glass = window.localStorage.getItem(GLASS_KEY) !== '0';
  } catch {
    // sem localStorage — ficam os padrões
  }
  return { theme, glass };
}

let atual: Aparencia = typeof window === 'undefined' ? { theme: 'light', glass: true } : lerDoArmazenamento();
const ouvintes = new Set<() => void>();

function publicar(proximo: Aparencia) {
  atual = proximo;
  try {
    window.localStorage.setItem(THEME_KEY, proximo.theme);
    window.localStorage.setItem(GLASS_KEY, proximo.glass ? '1' : '0');
  } catch {
    // a preferência some ao recarregar; não vale derrubar a tela por isso
  }
  ouvintes.forEach((avisar) => avisar());
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  // Outra aba mudou a preferência: acompanha, para as duas janelas não
  // ficarem em temas diferentes do mesmo app.
  const aoArmazenar = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== GLASS_KEY) return;
    atual = lerDoArmazenamento();
    avisar();
  };
  window.addEventListener('storage', aoArmazenar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener('storage', aoArmazenar);
  };
}

const retrato = () => atual;

export function useUpgradeTheme() {
  const { theme, glass } = useSyncExternalStore(assinar, retrato, retrato);

  const setTheme = useCallback((t: UpgradeTheme) => publicar({ ...atual, theme: t }), []);
  const setGlass = useCallback((g: boolean) => publicar({ ...atual, glass: g }), []);
  const toggleTheme = useCallback(
    () => publicar({ ...atual, theme: atual.theme === 'dark' ? 'light' : 'dark' }),
    [],
  );
  const toggleGlass = useCallback(() => publicar({ ...atual, glass: !atual.glass }), []);

  return { theme, setTheme, toggleTheme, glass, setGlass, toggleGlass };
}
