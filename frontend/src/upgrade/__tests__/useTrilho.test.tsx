import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trilhoExpandido, useTrilho, visitaAtual, TRILHO_FORA } from '../useTrilho';

// D-869 (Onda 3, editor, nota 1): modo foco. Nas telas da live o trilho
// recolhe para ícones sozinho — o player ganha ~150 px. A escolha manual
// vale até sair da live (decisão do Paulo, 05/10); fora, a de sempre.

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

describe('trilhoExpandido e visitaAtual', () => {
  const recolhida = (live: string | null) => ({ live, aberto: false });

  it('fora da live, aberto por padrão; a escolha gravada vale', () => {
    expect(trilhoExpandido(null, recolhida(null))).toBe(true);
    expect(trilhoExpandido(null, recolhida(null), 'recolhido')).toBe(false);
  });

  it('na live, recolhido ao entrar — mesmo para quem deixa o trilho aberto fora', () => {
    expect(trilhoExpandido('L1', recolhida(null), 'expandido')).toBe(false);
    expect(trilhoExpandido('L1', recolhida('L1'))).toBe(false);
  });

  it('aberto na live, fica aberto pelas telas dela', () => {
    const aberta = { live: 'L1', aberto: true };
    expect(visitaAtual(aberta, 'L1')).toBe(aberta);
    expect(trilhoExpandido('L1', aberta)).toBe(true);
  });

  it('sair e voltar, ou passar para outra live, recolhe de novo', () => {
    const aberta = { live: 'L1', aberto: true };
    expect(visitaAtual(aberta, null)).toEqual({ live: null, aberto: false });
    expect(visitaAtual(aberta, 'L2')).toEqual({ live: 'L2', aberto: false });
    expect(trilhoExpandido('L2', aberta)).toBe(false);
  });
});

describe('useTrilho', () => {
  function usar(live: string | null, guardado: Record<string, string> = {}) {
    const loja = armazenamento(guardado);
    vi.stubGlobal('window', { localStorage: loja });
    let trilho: ReturnType<typeof useTrilho> | undefined;
    function Sonda() {
      trilho = useTrilho(live);
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    return { trilho: trilho!, loja };
  }

  it('entrar numa live recolhe; fora, a escolha de sempre', () => {
    expect(usar('L1').trilho.expandido).toBe(false);
    expect(usar(null).trilho.expandido).toBe(true);
    expect(usar(null, { [TRILHO_FORA]: 'recolhido' }).trilho.expandido).toBe(false);
    // A preferência de fora não abre a live.
    expect(usar('L1', { [TRILHO_FORA]: 'expandido' }).trilho.expandido).toBe(false);
  });

  it('abrir na live não grava nada: a próxima entrada recolhe outra vez', () => {
    const { trilho, loja } = usar('L1');
    trilho.alternar();
    expect(loja.dados).toEqual({});
    expect(usar('L1', loja.dados).trilho.expandido).toBe(false);
  });

  it('a escolha feita fora fica gravada para fora, na chave de sempre', () => {
    const { trilho, loja } = usar(null);
    trilho.alternar();
    expect(loja.dados).toEqual({ [TRILHO_FORA]: 'recolhido' });
    expect(TRILHO_FORA).toBe('upgrade-trilho');
  });

  it('com o armazenamento bloqueado, ler e gravar não derrubam a casca', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado');
        },
        setItem: () => {
          throw new Error('bloqueado');
        },
      },
    });
    let trilho: ReturnType<typeof useTrilho> | undefined;
    function Sonda() {
      trilho = useTrilho(null);
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    expect(trilho!.expandido).toBe(true);
    expect(() => trilho!.alternar()).not.toThrow();
  });
});

describe('a casca usa o modo foco', () => {
  it('passa a live da tela (o id), ou null fora dela', () => {
    const casca = readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf8');
    expect(casca).toContain('useTrilho(dentroDeUmaLive(tela) ? projetoId : null)');
  });
});
