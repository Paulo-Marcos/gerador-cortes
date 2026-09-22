import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lugar } from '../historicoDaCasca';

// Ambiente node: localStorage de mentira. O store lê ao carregar o módulo,
// então cada caso importa uma cópia nova.
async function carregar(gravado?: string) {
  const guardado = new Map<string, string>();
  if (gravado !== undefined) guardado.set('upgrade-historico', gravado);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => guardado.set(k, v),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.resetModules();
  const mod = await import('../historicoDaCasca');
  // O hook só lê o store; renderizá-lo no servidor devolve o retrato atual.
  const ler = () => {
    let r!: ReturnType<typeof mod.useHistoricoDaCasca>;
    const Leitor = () => {
      r = mod.useHistoricoDaCasca();
      return null;
    };
    renderToStaticMarkup(createElement(Leitor));
    return r;
  };
  return { ...mod, ler, guardado };
}

const lugar = (to: string, rotulo = to): Lugar => ({ to, rotulo, icone: 'home', tipo: 'tela' });

afterEach(() => vi.unstubAllGlobals());

describe('historicoDaCasca', () => {
  it('a pilha é pilha: voltar duas vezes e avançar uma devolve o meio (8A)', async () => {
    const h = await carregar();
    ['/inicio', '/shorts/a', '/shorts/b', '/projetos/c'].forEach((to) => h.visitar(lugar(to)));
    expect(h.ler().voltar()?.to).toBe('/shorts/b');
    expect(h.ler().voltar()?.to).toBe('/shorts/a');
    expect(h.ler().voltar()?.to).toBe('/inicio');
    expect(h.ler().podeVoltar).toBe(false);
    expect(h.ler().avancar()?.to).toBe('/shorts/a');
  });

  it('andar para um lugar novo zera o avançar (8B)', async () => {
    const h = await carregar();
    ['/a', '/b', '/c'].forEach((to) => h.visitar(lugar(to)));
    h.ler().voltar();
    h.ler().voltar();
    h.visitar(lugar('/novo'));
    expect(h.ler().podeAvancar).toBe(false);
  });

  it('o MRU não duplica o mesmo lugar (8C)', async () => {
    const h = await carregar();
    for (let i = 0; i < 5; i++) {
      h.visitar(lugar('/shorts/a'));
      h.visitar(lugar('/shorts/b'));
    }
    expect(h.ler().lugares.map((l) => l.to)).toEqual(['/shorts/b', '/shorts/a']);
  });

  it('rótulo que chega depois não empilha outro passo (8E)', async () => {
    const h = await carregar();
    h.visitar(lugar('/inicio'));
    h.visitar(lugar('/projetos/x', 'live'));
    h.visitar(lugar('/projetos/x', 'Live 267 — o título de verdade'));
    const r = h.ler();
    expect(r.anterior?.to).toBe('/inicio');
    expect(r.lugares[0].rotulo).toBe('Live 267 — o título de verdade');
  });

  it('sobrevive ao recarregar e ignora payload corrompido (8D, 8G)', async () => {
    const a = await carregar();
    a.visitar(lugar('/a'));
    a.visitar(lugar('/b'));
    const salvo = a.guardado.get('upgrade-historico');
    expect((await carregar(salvo)).ler().lugares.map((l) => l.to)).toEqual(['/b', '/a']);
    expect((await carregar('{{{')).ler().lugares).toEqual([]);
  });

  it('o voltar do navegador conta como voltar, não como passo novo', async () => {
    const h = await carregar();
    ['/a', '/b', '/c'].forEach((to) => h.visitar(lugar(to)));
    h.visitarPeloNavegador(lugar('/b'));
    expect(h.ler().anterior?.to).toBe('/a');
    expect(h.ler().proximo?.to).toBe('/c');
    h.visitarPeloNavegador(lugar('/c'));
    expect(h.ler().podeAvancar).toBe(false);
    expect(h.ler().anterior?.to).toBe('/b');
  });
});
