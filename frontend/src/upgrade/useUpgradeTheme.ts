import { useCallback, useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · a rampa de cinco degraus.
//
// O eixo era binário: 0.975 L ou 0.170 L. Quem edita de tarde tinha
// glare; quem edita de noite tinha poço preto. Entre os dois não havia
// nada — e "nada" é onde a maior parte do dia de trabalho acontece.
//
// Agora o eixo é uma RAMPA ordenada. As pontas continuam chamando-se
// 'light' e 'dark' de propósito: os blocos .ap[data-theme='dark'] que já
// existem no upgrade.css seguem valendo sem uma linha de mudança, e quem
// tinha escolhido escuro volta a ver escuro. Os três nomes novos entraram
// NO MEIO em vez de renomear as pontas.
//
// toggleTheme mantém o contrato antigo (claro ⇄ escuro), porque é o que o
// ícone de sol/lua promete. Para andar degrau a degrau existem clarear e
// escurecer — é o que a rampa da barra superior usa.
// ─────────────────────────────────────────────────────────────────

export type UpgradeTheme = 'light' | 'papel' | 'nevoa' | 'ardosia' | 'dark';

/** Do mais claro ao mais escuro. A ORDEM é o componente. */
export const RAMPA: UpgradeTheme[] = ['light', 'papel', 'nevoa', 'ardosia', 'dark'];

export const NOME_DO_TEMA: Record<UpgradeTheme, string> = {
  light: 'Claro',
  papel: 'Papel',
  nevoa: 'Névoa',
  ardosia: 'Ardósia',
  dark: 'Escuro',
};

/** Luminância aproximada do fundo — a dica de cada degrau mostra isso. */
export const LUMINANCIA: Record<UpgradeTheme, string> = {
  light: '0.975 L',
  papel: '0.945 L',
  nevoa: '0.870 L',
  ardosia: '0.345 L',
  dark: '0.170 L',
};

/** Amostra sólida, para desenhar o degrau sem montar o tema inteiro. */
export const AMOSTRA: Record<UpgradeTheme, string> = {
  light: 'oklch(0.975 0.004 240)',
  papel: 'oklch(0.945 0.014 78)',
  nevoa: 'oklch(0.87 0.007 250)',
  ardosia: 'oklch(0.345 0.016 256)',
  dark: 'oklch(0.17 0.012 255)',
};

/** Degraus que pedem color-scheme: dark (scrollbar, autofill, inputs). */
export function temaEscuro(t: UpgradeTheme): boolean {
  return t === 'ardosia' || t === 'dark';
}

const THEME_KEY = 'upgrade-theme';
const GLASS_KEY = 'upgrade-glass';

type Aparencia = { theme: UpgradeTheme; glass: boolean };

function ehTema(v: unknown): v is UpgradeTheme {
  return typeof v === 'string' && (RAMPA as string[]).includes(v);
}

function lerDoArmazenamento(): Aparencia {
  let theme: UpgradeTheme = 'light';
  let glass = true;
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    if (ehTema(t)) theme = t;
    glass = window.localStorage.getItem(GLASS_KEY) !== '0';
  } catch {
    // sem localStorage — ficam os padrões
  }
  return { theme, glass };
}

let atual: Aparencia =
  typeof window === 'undefined' ? { theme: 'light', glass: true } : lerDoArmazenamento();
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

function anda(passo: 1 | -1): UpgradeTheme {
  const i = RAMPA.indexOf(atual.theme);
  return RAMPA[Math.min(RAMPA.length - 1, Math.max(0, (i < 0 ? 0 : i) + passo))];
}

export function useUpgradeTheme() {
  const { theme, glass } = useSyncExternalStore(assinar, retrato, retrato);

  const setTheme = useCallback((t: UpgradeTheme) => publicar({ ...atual, theme: t }), []);
  const setGlass = useCallback((g: boolean) => publicar({ ...atual, glass: g }), []);
  const toggleTheme = useCallback(
    () => publicar({ ...atual, theme: temaEscuro(atual.theme) ? 'light' : 'dark' }),
    [],
  );
  const clarear = useCallback(() => publicar({ ...atual, theme: anda(-1) }), []);
  const escurecer = useCallback(() => publicar({ ...atual, theme: anda(1) }), []);
  const toggleGlass = useCallback(() => publicar({ ...atual, glass: !atual.glass }), []);

  return {
    theme,
    setTheme,
    toggleTheme,
    clarear,
    escurecer,
    escuro: temaEscuro(theme),
    glass,
    setGlass,
    toggleGlass,
  };
}
