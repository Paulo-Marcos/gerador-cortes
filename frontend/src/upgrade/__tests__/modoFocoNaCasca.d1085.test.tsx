import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoModoFoco } from '@/features/editor/BotaoModoFoco';
import { BrutoContextStrip } from '@/features/editor/fase1/BrutoContextStrip';
import {
  alternarTrilhoForaDoFoco,
  aoSairDoEditor,
  entrarNoFoco,
  ligarFocoAoNavegador,
  storeDoFoco,
  trechosNoFoco,
} from '../modoFoco';
import { UpgradeShell } from '../UpgradeShell';

// D-1085: o que a pessoa VÊ no foco — a casca montada de verdade, em HTML.

afterEach(() => {
  storeDoFoco.zerar();
  vi.unstubAllGlobals();
});

const ROTA_DO_EDITOR = '/projetos/p1/cortes/c1';

function casca(rota = ROTA_DO_EDITOR) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[rota]}>
        <UpgradeShell>
          <p>conteudo-do-editor</p>
        </UpgradeShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('a casca montada', () => {
  it('fora do foco tem trilho, barra superior e cabeçalho', () => {
    const html = casca();
    expect(html).toContain('conteudo-do-editor');
    expect(html).toContain('<aside');
    expect(html).toContain('<nav');
    expect(html).toContain('<header');
    expect(html).toContain('Editor de cortes');
  });

  it('no foco só sobra o conteúdo: sem trilho, barra superior nem cabeçalho da tela', () => {
    storeDoFoco.aplicar(entrarNoFoco);
    const html = casca();
    expect(html).toContain('conteudo-do-editor');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<header');
    expect(html).not.toContain('Editor de cortes');
    expect(html).toContain('grid-template-columns:1fr');
  });
});

describe('a faixa do editor', () => {
  const faixa = () =>
    renderToStaticMarkup(
      <BrutoContextStrip
        inicioHms="00:00:10.0"
        fimHms="00:00:50.0"
        inicioSeg={10}
        currentTime={12}
        durSeg={40}
        liquidoSeg={38}
        intervaloAberto={false}
        onToggleIntervalo={() => undefined}
      />,
    );

  it('fora do foco mostra os tempos e o botão de entrar', () => {
    const html = faixa();
    expect(html).toContain('Liquido');
    expect(html).toContain('aria-pressed="false"');
  });

  it('no foco os tempos somem e fica só o botão de sair', () => {
    storeDoFoco.aplicar(entrarNoFoco);
    const html = faixa();
    expect(html).not.toContain('Liquido');
    expect(html).toBe(renderToStaticMarkup(<BotaoModoFoco ativo flutuante />));
  });
});

describe('a ligação com o navegador', () => {
  function navegadorFalso() {
    const ouvintes: Record<string, Array<(e: never) => void>> = {};
    const alvo = {
      fullscreenElement: null as Element | null,
      addEventListener: (t: string, f: (e: never) => void) => (ouvintes[t] ??= []).push(f),
      removeEventListener: (t: string, f: (e: never) => void) => {
        ouvintes[t] = (ouvintes[t] ?? []).filter((x) => x !== f);
      },
    };
    const emitir = (t: string, e: object = {}) => ouvintes[t]?.forEach((f) => f(e as never));
    return { alvo, ouvintes, emitir };
  }

  it('sair da tela cheia pelo navegador tira o foco; desligar solta os ouvintes', () => {
    const { alvo, ouvintes, emitir } = navegadorFalso();
    const desligar = ligarFocoAoNavegador(alvo as never, alvo as never, () => false);
    storeDoFoco.aplicar(entrarNoFoco);
    alvo.fullscreenElement = {} as Element;
    emitir('fullscreenchange');
    expect(storeDoFoco.ler()).toEqual({ ativo: true, telaCheia: true });
    alvo.fullscreenElement = null;
    emitir('fullscreenchange');
    expect(storeDoFoco.ler().ativo).toBe(false);
    desligar();
    expect(ouvintes.fullscreenchange).toHaveLength(0);
    expect(ouvintes.keydown).toHaveLength(0);
  });

  it('Esc sai do foco quando a tela cheia foi recusada, mas não com diálogo aberto', () => {
    const { alvo, emitir } = navegadorFalso();
    let dialogo = true;
    ligarFocoAoNavegador(alvo as never, alvo as never, () => dialogo);
    storeDoFoco.aplicar(entrarNoFoco);
    emitir('keydown', { key: 'Escape', defaultPrevented: false });
    expect(storeDoFoco.ler().ativo).toBe(true);
    dialogo = false;
    emitir('keydown', { key: 'a', defaultPrevented: false });
    expect(storeDoFoco.ler().ativo).toBe(true);
    emitir('keydown', { key: 'Escape', defaultPrevented: false });
    expect(storeDoFoco.ler().ativo).toBe(false);
  });

  it('deixar a tela do editor acaba com o foco; ficar nela, não', () => {
    storeDoFoco.aplicar(entrarNoFoco);
    aoSairDoEditor(true);
    expect(storeDoFoco.ler().ativo).toBe(true);
    aoSairDoEditor(false);
    expect(storeDoFoco.ler().ativo).toBe(false);
  });
});

describe('Ctrl+B no foco', () => {
  it('só alterna o trilho quando ele está visível', () => {
    const alternar = vi.fn();
    alternarTrilhoForaDoFoco(false, alternar)();
    expect(alternar).not.toHaveBeenCalled();
    alternarTrilhoForaDoFoco(true, alternar)();
    expect(alternar).toHaveBeenCalledOnce();
  });
});

describe('a coluna de trechos no foco', () => {
  it('some e o botão de reabrir também; a escolha lembrada não muda', () => {
    expect(trechosNoFoco(false, false)).toEqual({ recolhidos: false, mostrarReabrir: false });
    expect(trechosNoFoco(false, true)).toEqual({ recolhidos: true, mostrarReabrir: false });
    expect(trechosNoFoco(true, false)).toEqual({ recolhidos: true, mostrarReabrir: true });
    expect(trechosNoFoco(true, true)).toEqual({ recolhidos: true, mostrarReabrir: false });
  });
});
