import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function renderizar(gravado: string | null) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k === 'upgrade-theme' ? gravado : null),
      setItem: () => {},
    },
    matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.resetModules();
  const { AparenciaDaCasca } = await import('../AparenciaDaCasca');
  return renderToStaticMarkup(createElement(AparenciaDaCasca));
}

afterEach(() => vi.unstubAllGlobals());

describe('AparenciaDaCasca · o cartão Tema', () => {
  it('oferece Escuro, Claro e Auto, e marca a escolha salva', async () => {
    const html = await renderizar('auto');
    const botoes = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>.*?<\/button>/g)].map((m) => ({
      // o rótulo é o texto depois da última tag, antes do </button> (sem apagar tags)
      texto: m[0].slice(0, -'</button>'.length).split('>').pop() ?? '',
      ativo: m[1] === 'true',
    }));
    const tema = botoes.filter((b) => ['Escuro', 'Claro', 'Auto'].includes(b.texto));
    expect(tema.map((b) => b.texto)).toEqual(['Escuro', 'Claro', 'Auto']);
    expect(tema.filter((b) => b.ativo).map((b) => b.texto)).toEqual(['Auto']);
  });

  it('paleta antiga salva abre marcada no degrau novo', async () => {
    const html = await renderizar('papel');
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Claro/);
  });

  it('não tem mais o seletor de cor de acento', async () => {
    const html = await renderizar(null);
    expect(html).not.toContain('Cor de acento');
    expect(html).not.toContain('radiogroup');
  });
});
