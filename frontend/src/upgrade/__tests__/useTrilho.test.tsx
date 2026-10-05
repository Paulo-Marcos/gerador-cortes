import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comEscolha, trilhoExpandido, useTrilho, TRILHO_FORA, TRILHO_NA_LIVE } from '../useTrilho';

// D-869 (Onda 3, editor, nota 1): modo foco. Nas telas da live o trilho
// recolhe para ícones sozinho — o player ganha ~150 px —, e a escolha manual
// é respeitada: cada lugar (dentro e fora da live) lembra a sua.

function armazenamento(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => (k in dados ? dados[k] : null),
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('trilhoExpandido', () => {
  it('fora da live, aberto por padrão; dentro da live, recolhido por padrão', () => {
    expect(trilhoExpandido(false, {})).toBe(true);
    expect(trilhoExpandido(true, {})).toBe(false);
  });

  it('respeita a escolha manual de cada lugar, sem misturar as duas', () => {
    expect(trilhoExpandido(true, { live: 'expandido' })).toBe(true);
    expect(trilhoExpandido(false, { fora: 'recolhido' })).toBe(false);
    // Recolher fora não mexe na live, e abrir na live não mexe fora.
    expect(trilhoExpandido(true, { fora: 'expandido' })).toBe(false);
    expect(trilhoExpandido(false, { live: 'expandido' })).toBe(true);
  });
});

describe('comEscolha', () => {
  it('o clique muda o trilho na hora, só no lugar onde se está', () => {
    const naLive = comEscolha({ fora: 'expandido' }, true, 'expandido');
    expect(naLive).toEqual({ fora: 'expandido', live: 'expandido' });
    expect(trilhoExpandido(true, naLive)).toBe(true);
    const fora = comEscolha({ live: 'expandido' }, false, 'recolhido');
    expect(fora).toEqual({ live: 'expandido', fora: 'recolhido' });
    expect(trilhoExpandido(false, fora)).toBe(false);
  });

  it('o hook aplica a escolha ao estado com esta regra', () => {
    const fonte = readFileSync(resolve(__dirname, '../useTrilho.ts'), 'utf8');
    expect(fonte).toContain('setEscolhas((atual) => comEscolha(atual, dentroDaLive, escolha));');
  });
});

describe('useTrilho', () => {
  function usar(dentroDaLive: boolean, guardado: Record<string, string> = {}) {
    const loja = armazenamento(guardado);
    vi.stubGlobal('window', { localStorage: loja });
    let trilho: ReturnType<typeof useTrilho> | undefined;
    function Sonda() {
      trilho = useTrilho(dentroDaLive);
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    return { trilho: trilho!, loja };
  }

  it('entrar numa live recolhe o trilho; sair devolve a escolha de fora', () => {
    expect(usar(true).trilho.expandido).toBe(false);
    expect(usar(false).trilho.expandido).toBe(true);
    expect(usar(false, { [TRILHO_FORA]: 'recolhido' }).trilho.expandido).toBe(false);
  });

  it('a escolha feita na live fica lembrada para a live', () => {
    const { trilho, loja } = usar(true);
    trilho.alternar();
    expect(loja.dados[TRILHO_NA_LIVE]).toBe('expandido');
    expect(loja.dados[TRILHO_FORA]).toBeUndefined();
    expect(usar(true, loja.dados).trilho.expandido).toBe(true);
  });

  it('a escolha feita fora fica lembrada para fora, como antes', () => {
    const { trilho, loja } = usar(false);
    trilho.alternar();
    expect(loja.dados[TRILHO_FORA]).toBe('recolhido');
    expect(loja.dados[TRILHO_NA_LIVE]).toBeUndefined();
  });

  it('a chave de fora é a que já existia: quem tinha recolhido não perde a escolha', () => {
    expect(TRILHO_FORA).toBe('upgrade-trilho');
  });

  it('sem localStorage, o padrão de cada lugar vale', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado');
        },
      },
    });
    let trilho: ReturnType<typeof useTrilho> | undefined;
    function Sonda() {
      trilho = useTrilho(true);
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    expect(trilho!.expandido).toBe(false);
  });
});

describe('a casca usa o modo foco', () => {
  it('pergunta à tela se está dentro de uma live', () => {
    const casca = readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf8');
    expect(casca).toContain('useTrilho(dentroDeUmaLive(tela))');
  });
});
