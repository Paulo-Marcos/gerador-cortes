import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Ambiente node: um localStorage de mentira basta. O store lê a preferência
// UMA vez, ao carregar o módulo — por isso cada caso grava e só então
// importa uma cópia nova.
async function temaAoAbrir(gravado: string | null) {
  const guardado = new Map<string, string>();
  if (gravado !== null) guardado.set('upgrade-theme', gravado);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => guardado.set(k, v),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.resetModules();
  const { useUpgradeTheme } = await import('../useUpgradeTheme');
  const Leitor = () => createElement('i', null, useUpgradeTheme().theme);
  return renderToStaticMarkup(createElement(Leitor)).replace(/<\/?i>/g, '');
}

afterEach(() => vi.unstubAllGlobals());

describe('useUpgradeTheme · rampa de cinco degraus', () => {
  it('abre no degrau gravado', async () => {
    expect(await temaAoAbrir('ardosia')).toBe('ardosia');
  });

  it('quem já usava escuro continua no escuro', async () => {
    expect(await temaAoAbrir('dark')).toBe('dark');
  });

  it('valor desconhecido ou ausente cai no claro', async () => {
    expect(await temaAoAbrir('xpto')).toBe('light');
    expect(await temaAoAbrir(null)).toBe('light');
  });

  it('temaEscuro marca só Ardósia e Escuro', async () => {
    const { RAMPA, temaEscuro } = await import('../useUpgradeTheme');
    expect(RAMPA).toEqual(['light', 'papel', 'nevoa', 'ardosia', 'dark']);
    expect(RAMPA.filter(temaEscuro)).toEqual(['ardosia', 'dark']);
  });
});
