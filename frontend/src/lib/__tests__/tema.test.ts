import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aplicarTema,
  COR_DA_BARRA,
  migrarPreferencia,
  NOME_DA_PREFERENCIA,
  PREFERENCIAS,
  resolverTema,
} from '../tema';

describe('migrarPreferencia · o valor salvo das paletas antigas', () => {
  it.each([
    ['ardosia', 'dark'],
    ['dark', 'dark'],
    ['light', 'light'],
    ['papel', 'light'],
    ['nevoa', 'light'],
    ['auto', 'auto'],
  ])('%s vira %s', (salvo, esperado) => {
    expect(migrarPreferencia(salvo)).toBe(esperado);
  });

  it('ausente vira dark (DIRECAO §3: antes o app abria claro)', () => {
    expect(migrarPreferencia(null)).toBe('dark');
    expect(migrarPreferencia(undefined)).toBe('dark');
  });

  it('valor desconhecido também cai no escuro', () => {
    expect(migrarPreferencia('xpto')).toBe('dark');
    expect(migrarPreferencia(42)).toBe('dark');
  });
});

describe('o seletor tem três opções', () => {
  it('Escuro, Claro e Auto, nesta ordem', () => {
    expect(PREFERENCIAS.map((p) => NOME_DA_PREFERENCIA[p])).toEqual(['Escuro', 'Claro', 'Auto']);
  });
});

describe('resolverTema', () => {
  it('escolha explícita vale por si, qualquer que seja o sistema', () => {
    expect(resolverTema('dark', false)).toBe('dark');
    expect(resolverTema('light', true)).toBe('light');
  });

  it('Auto segue o prefers-color-scheme', () => {
    expect(resolverTema('auto', true)).toBe('dark');
    expect(resolverTema('auto', false)).toBe('light');
  });
});

describe('aplicarTema · <html> e theme-color', () => {
  function alvo() {
    const attrs = new Map<string, string>();
    return { attrs, setAttribute: (n: string, v: string) => void attrs.set(n, v) };
  }

  it.each(['dark', 'light'] as const)('põe %s no <html> e a cor da barra do tema', (tema) => {
    const raiz = alvo();
    const meta = alvo();
    aplicarTema(raiz, meta, tema);
    expect(raiz.attrs.get('data-theme')).toBe(tema);
    expect(meta.attrs.get('content')).toBe(COR_DA_BARRA[tema]);
  });

  it('a cor da barra é o fundo de cada tema (DIRECAO §3)', () => {
    expect(COR_DA_BARRA).toEqual({ dark: '#07080b', light: '#eceef5' });
  });

  it('sem a meta no documento, só o <html> muda', () => {
    const raiz = alvo();
    aplicarTema(raiz, null, 'light');
    expect(raiz.attrs.get('data-theme')).toBe('light');
  });
});

// O store lê o armazenamento ao carregar o módulo: cada caso grava e importa uma cópia nova.
async function abrirCom(gravado: string | null, sistemaEscuro: boolean) {
  const guardado = new Map<string, string>();
  if (gravado !== null) guardado.set('upgrade-theme', gravado);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => guardado.set(k, v),
    },
    matchMedia: () => ({ matches: sistemaEscuro, addEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.resetModules();
  const { useUpgradeTheme } = await import('../tema');
  const Leitor = () => {
    const { preferencia, theme } = useUpgradeTheme();
    return createElement('i', null, `${preferencia}/${theme}`);
  };
  return renderToStaticMarkup(createElement(Leitor)).replace(/<\/?i>/g, '');
}

describe('useUpgradeTheme ao abrir', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('paleta antiga salva migra: ardosia → Escuro, papel → Claro', async () => {
    expect(await abrirCom('ardosia', false)).toBe('dark/dark');
    expect(await abrirCom('papel', true)).toBe('light/light');
  });

  it('nada salvo abre em Escuro, mesmo com o sistema claro', async () => {
    expect(await abrirCom(null, false)).toBe('dark/dark');
  });

  it('Auto pinta o que o sistema pede', async () => {
    expect(await abrirCom('auto', true)).toBe('auto/dark');
    expect(await abrirCom('auto', false)).toBe('auto/light');
  });
});

describe('Auto repinta quando o sistema troca', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('o evento change da consulta muda o data-theme do <html> sem recarregar', async () => {
    let escuro = true;
    let aoMudar: () => void = () => {};
    const attrs = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => (k === 'upgrade-theme' ? 'auto' : null), setItem: () => {} },
      matchMedia: () => ({
        get matches() {
          return escuro;
        },
        addEventListener: (_: string, f: () => void) => (aoMudar = f),
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('document', {
      documentElement: { setAttribute: (n: string, v: string) => void attrs.set(n, v) },
      querySelector: () => null,
    });
    vi.resetModules();
    const { iniciarTema } = await import('../tema');
    iniciarTema();
    expect(attrs.get('data-theme')).toBe('dark');
    escuro = false;
    aoMudar();
    expect(attrs.get('data-theme')).toBe('light');
  });
});
