import { useCallback, useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-1133 (E-069 H-04) · três temas: Escuro, Claro e Auto.
//
// A rampa de cinco degraus (D-746) acabou: a Sala escura (DIRECAO §3) tem um
// escuro, um claro e o "Auto", que segue o sistema. O que o operador ESCOLHE
// é a `Preferencia` (dark | light | auto); o que a tela PINTA é o `Tema`
// (dark | light), já resolvido. O Auto só existe na escolha: no <html> o
// atributo é sempre um dos dois, e o `color-scheme` sai dele pelo CSS.
// ─────────────────────────────────────────────────────────────────

export type Tema = 'dark' | 'light';
export type Preferencia = Tema | 'auto';

/** Alias do nome antigo: os consumidores da casca só precisam do tema pintado. */
export type UpgradeTheme = Tema;

export const PREFERENCIAS: Preferencia[] = ['dark', 'light', 'auto'];

export const NOME_DA_PREFERENCIA: Record<Preferencia, string> = {
  dark: 'Escuro',
  light: 'Claro',
  auto: 'Auto',
};

export function temaEscuro(t: Tema): boolean {
  return t === 'dark';
}

/**
 * O que estava salvo vira uma das três escolhas. As paletas antigas (D-746)
 * descem para o par mais próximo: as escuras (`ardosia`, `dark`) para Escuro,
 * as claras (`papel`, `nevoa`, `light`) para Claro. Ausente ou desconhecido
 * vira Escuro: é a decisão da DIRECAO §3 (antes o app abria claro).
 */
export function migrarPreferencia(salvo: unknown): Preferencia {
  switch (salvo) {
    case 'light':
    case 'papel':
    case 'nevoa':
      return 'light';
    case 'auto':
      return 'auto';
    default:
      return 'dark';
  }
}

/** Auto segue o sistema; as duas escolhas explícitas valem por si. */
export function resolverTema(pref: Preferencia, sistemaEscuro: boolean): Tema {
  if (pref === 'auto') return sistemaEscuro ? 'dark' : 'light';
  return pref;
}

type Raiz = Pick<HTMLElement, 'setAttribute'>;
type MetaDaBarra = Pick<HTMLMetaElement, 'setAttribute'>;

/**
 * Põe o tema no <html> (o CSS tira o `color-scheme` dele) e a cor da barra, que é o
 * fundo do tema. `fundo` lê o `--cc-bg` já com o tema aplicado: a cor mora só no CSS.
 */
export function aplicarTema(
  raiz: Raiz,
  meta: MetaDaBarra | null,
  tema: Tema,
  fundo: () => string,
): void {
  raiz.setAttribute('data-theme', tema);
  const cor = fundo();
  if (cor) meta?.setAttribute('content', cor);
}

const THEME_KEY = 'upgrade-theme';
const GLASS_KEY = 'upgrade-glass';
const CONSULTA_ESCURA = '(prefers-color-scheme: dark)';

type Aparencia = { preferencia: Preferencia; glass: boolean };

function lerDoArmazenamento(): Aparencia {
  let preferencia: Preferencia = 'dark';
  let glass = true;
  try {
    preferencia = migrarPreferencia(window.localStorage.getItem(THEME_KEY));
    glass = window.localStorage.getItem(GLASS_KEY) !== '0';
  } catch {
    // sem localStorage — ficam os padrões
  }
  return { preferencia, glass };
}

function sistemaEscuro(): boolean {
  try {
    return window.matchMedia(CONSULTA_ESCURA).matches;
  } catch {
    return true; // sem matchMedia, o padrão da Sala: escuro
  }
}

let atual: Aparencia =
  typeof window === 'undefined' ? { preferencia: 'dark', glass: true } : lerDoArmazenamento();
const ouvintes = new Set<() => void>();

function pintar() {
  if (typeof document === 'undefined') return;
  aplicarTema(
    document.documentElement,
    document.querySelector('meta[name="theme-color"]'),
    resolverTema(atual.preferencia, sistemaEscuro()),
    () => getComputedStyle(document.documentElement).getPropertyValue('--cc-bg').trim(),
  );
}

function publicar(proximo: Aparencia) {
  atual = proximo;
  try {
    window.localStorage.setItem(THEME_KEY, proximo.preferencia);
    window.localStorage.setItem(GLASS_KEY, proximo.glass ? '1' : '0');
  } catch {
    // a preferência some ao recarregar; não vale derrubar a tela por isso
  }
  pintar();
  ouvintes.forEach((avisar) => avisar());
}

let consultaDoSistema: MediaQueryList | null = null;

/** Chamada uma vez no boot, antes do React, para a tela já nascer no tema certo. */
export function iniciarTema(): void {
  pintar();
  try {
    // Com o Auto, a troca do sistema (ao entardecer, por exemplo) repinta na hora.
    // Guardado em módulo: a consulta com ouvinte não pode sumir com o coletor de lixo.
    consultaDoSistema = window.matchMedia(CONSULTA_ESCURA);
    consultaDoSistema.addEventListener('change', () => {
      pintar();
      ouvintes.forEach((avisar) => avisar());
    });
  } catch {
    // sem matchMedia o Auto vale o escuro e não há o que ouvir
  }
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  const aoArmazenar = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== GLASS_KEY) return;
    atual = lerDoArmazenamento();
    pintar();
    avisar();
  };
  window.addEventListener('storage', aoArmazenar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener('storage', aoArmazenar);
  };
}

/** O retrato precisa ser estável entre leituras iguais (useSyncExternalStore). */
let retratoAnterior = '';
let retratoCache: { preferencia: Preferencia; theme: Tema; glass: boolean } | null = null;
function retrato() {
  const theme = resolverTema(atual.preferencia, sistemaEscuro());
  const chave = `${atual.preferencia}|${theme}|${atual.glass}`;
  if (chave !== retratoAnterior || !retratoCache) {
    retratoAnterior = chave;
    retratoCache = { preferencia: atual.preferencia, theme, glass: atual.glass };
  }
  return retratoCache;
}

export function useUpgradeTheme() {
  const { preferencia, theme, glass } = useSyncExternalStore(assinar, retrato, retrato);

  const setTheme = useCallback((p: Preferencia) => publicar({ ...atual, preferencia: p }), []);
  const setGlass = useCallback((g: boolean) => publicar({ ...atual, glass: g }), []);
  // O sol/lua da barra promete claro ⇄ escuro: sai do Auto para o oposto do que se vê.
  const toggleTheme = useCallback(
    () =>
      publicar({
        ...atual,
        preferencia: temaEscuro(resolverTema(atual.preferencia, sistemaEscuro())) ? 'light' : 'dark',
      }),
    [],
  );
  const toggleGlass = useCallback(() => publicar({ ...atual, glass: !atual.glass }), []);

  return {
    preferencia,
    theme,
    setTheme,
    toggleTheme,
    escuro: temaEscuro(theme),
    glass,
    setGlass,
    toggleGlass,
  };
}
