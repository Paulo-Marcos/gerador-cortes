import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O store lê o armazenamento ao carregar o módulo: cada caso importa uma cópia nova.
async function abrir(gravado: string | null, sistemaEscuro: boolean) {
  const guardado = new Map<string, string>();
  if (gravado !== null) guardado.set('upgrade-theme', gravado);
  const attrs = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
    },
    matchMedia: () => ({ matches: sistemaEscuro, addEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#000' }));
  vi.stubGlobal('document', {
    documentElement: { setAttribute: (n: string, v: string) => void attrs.set(n, v) },
    querySelector: () => null,
  });
  vi.resetModules();
  const { useUpgradeTheme } = await import('../tema');
  let api!: ReturnType<typeof useUpgradeTheme>;
  const Leitor = () => {
    api = useUpgradeTheme();
    return null;
  };
  renderToStaticMarkup(createElement(Leitor));
  return { api, guardado, attrs };
}

afterEach(() => vi.unstubAllGlobals());

describe('setTheme', () => {
  it('grava a escolha e pinta o <html>', async () => {
    const { api, guardado, attrs } = await abrir('dark', true);
    api.setTheme('light');
    expect(guardado.get('upgrade-theme')).toBe('light');
    expect(attrs.get('data-theme')).toBe('light');
  });

  it('Auto grava "auto" e pinta o que o sistema pede', async () => {
    const { api, guardado, attrs } = await abrir('dark', false);
    api.setTheme('auto');
    expect(guardado.get('upgrade-theme')).toBe('auto');
    expect(attrs.get('data-theme')).toBe('light');
  });
});

describe('toggleTheme (sol/lua da barra)', () => {
  it('claro ⇄ escuro', async () => {
    const { api, guardado } = await abrir('dark', true);
    api.toggleTheme();
    expect(guardado.get('upgrade-theme')).toBe('light');
    api.toggleTheme();
    expect(guardado.get('upgrade-theme')).toBe('dark');
  });

  it('saindo do Auto vai para o oposto do que se vê', async () => {
    const claro = await abrir('auto', false);
    claro.api.toggleTheme();
    expect(claro.guardado.get('upgrade-theme')).toBe('dark');
    const escuro = await abrir('auto', true);
    escuro.api.toggleTheme();
    expect(escuro.guardado.get('upgrade-theme')).toBe('light');
  });
});
