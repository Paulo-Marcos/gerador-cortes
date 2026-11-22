import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../ActionBar';
import { partesDoTitulo, ScreenHeader, sobretituloDaTela } from '../ScreenHeader';
import { TrilhaDeEtapas } from '../TrilhaDeEtapas';
import { trilhaDaLive } from '../trilhaDaLive';

// D-1137 (E-069 H-13; DIRECAO §3.1, §3.3, §5 e §7.0): as peças da sala.

describe('cabeçalho de tela', () => {
  it('a última palavra do título é a que vai em 800 no feixe', () => {
    expect(partesDoTitulo('Biblioteca de lives')).toEqual(['Biblioteca de ', 'lives']);
    expect(partesDoTitulo('Análises')).toEqual(['', 'Análises']);
  });

  it('o sobretítulo é o grupo do trilho a que a tela pertence', () => {
    expect(sobretituloDaTela('biblioteca', [])).toBe('Produção');
    expect(sobretituloDaTela('fila', [])).toBe('Produção');
    expect(sobretituloDaTela('ranking', [])).toBe('Inteligência');
    expect(sobretituloDaTela('config', [])).toBe('Ferramentas');
  });

  it('fora de qualquer grupo, o sobretítulo é a migalha de cima', () => {
    expect(sobretituloDaTela('erro', [{ texto: 'Biblioteca' }, { texto: 'Página não encontrada' }])).toBe('Biblioteca');
  });

  it('um h1 com a palavra no feixe, o sobretítulo e a busca Ctrl K em pílula', () => {
    const html = renderToStaticMarkup(<ScreenHeader titulo="Biblioteca de lives" sobretitulo="Produção" sub="219 lives" onAbrirBusca={vi.fn()} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="[^"]*font-light[^"]*">Biblioteca de <span class="font-extrabold text-feixe">lives<\/span><\/h1>/);
    expect(html).toMatch(/<p class="[^"]*text-iris[^"]*">Produção<\/p>/);
    expect(html).toContain('219 lives');
    expect(html).toMatch(/aria-keyshortcuts="Control\+K"(?:(?!<\/button>).)*<kbd[^>]*>Ctrl K<\/kbd>/);
  });

  it('sem busca dada, a pílula não aparece (dentro de uma live ela mora na linha do topo)', () => {
    expect(renderToStaticMarkup(<ScreenHeader titulo="Análises" />)).not.toContain('Ctrl K');
  });
});

describe('trilha da live em cápsula', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TrilhaDeEtapas
        etapas={trilhaDaLive('pos', '267', '7', {
          statusDoProjeto: 'analisado',
          arquivosLimpos: false,
          cortes: [{ id: 'a', status: 'aprovado' }],
          exportados: [],
        })}
      />
    </MemoryRouter>,
  );

  it('é uma cápsula de vidro da casca', () => {
    expect(html).toMatch(/^<nav aria-label="Etapas da live" class="cc-vidro-casca [^"]*rounded-pilula/);
  });

  it('o feixe marca só a etapa atual ("onde estou")', () => {
    expect(html.match(/bg-feixe/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"(?:(?!<\/a>).)*bg-feixe/);
  });
});

describe('barra de ação em pílula', () => {
  const html = renderToStaticMarkup(
    <ActionBar barra={{ secundario: { texto: 'Riscar corte', icone: 'trash' }, primario: { texto: 'Ir para a Pós', icone: 'arrow-right' } }} />,
  );

  it('é uma barra de ferramentas de vidro, em pílula', () => {
    expect(html).toMatch(/^<div class="cc-vidro-casca [^"]*flex-wrap[^"]*rounded-pilula[^"]*" role="toolbar" aria-label="Ações da tela"/);
  });

  it('o primário é o botão do feixe, e é um só', () => {
    expect(html.match(/data-variant="primario"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*bg-feixe[^>]*data-variant="primario"[^>]*>(?:(?!<\/button>).)*Ir para a Pós/);
  });
});

describe('"Reduzir efeitos" em Configurações › Aparência', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function aparencia(vidro: string | null) {
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => (k === 'upgrade-glass' ? vidro : null), setItem: () => {} },
      matchMedia: () => ({ matches: true, addEventListener: () => {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.resetModules();
    const { AparenciaDaCasca } = await import('../AparenciaDaCasca');
    return renderToStaticMarkup(createElement(AparenciaDaCasca));
  }

  it('é um interruptor com rótulo, desligado quando o vidro está ligado', async () => {
    const html = await aparencia(null);
    expect(html).toMatch(/<label[^>]*><button[^>]*role="switch"[^>]*aria-checked="false"[^>]*><\/button>Reduzir efeitos<\/label>/);
  });

  it('ligado quando o vidro foi desligado (a mesma preferência, `upgrade-glass`)', async () => {
    expect(await aparencia('0')).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });

  it('tomou o lugar do Vidro/Sólido', async () => {
    const html = await aparencia(null);
    expect(html).not.toContain('Superfície');
    expect(html).not.toContain('>Sólido<');
  });
});
