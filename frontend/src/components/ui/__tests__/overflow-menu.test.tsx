import { Children, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatilhoDoMenu, ItemDoMenu, OverflowMenu } from '../overflow-menu';
import { AcoesDaTela } from '@/upgrade/ScreenHeader';

// D-861: desde a D-857 o item do menu recebe o NOME do ícone e o menu o desenha
// pelo Icon (antes recebia o componente do lucide e o guardava num `Icon`
// local que escondia o da escala).
//
// Sem DOM no ambiente de teste não há clique: para ver o painel aberto, o
// `useState(false)` do menu começa em true — só neste arquivo e só enquanto
// `abrirMenu` estiver ligado.
let abrirMenu = false;
// D-867: com `espiarAberto`, o setter do estado aberto/fechado anota o que
// recebeu — é assim que se vê, sem DOM, o menu ligar gatilho e itens a ele.
let espiarAberto = false;
const mudancasDoAberto: unknown[] = [];
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: ((inicial: unknown) => {
      const par = react.useState(abrirMenu && inicial === false ? true : inicial);
      if (espiarAberto && inicial === false)
        return [par[0], (valor: unknown) => mudancasDoAberto.push(valor)];
      return par;
    }) as typeof react.useState,
  };
});

afterEach(() => {
  abrirMenu = false;
  espiarAberto = false;
  mudancasDoAberto.length = 0;
});

const itens = [
  { icon: 'check-check' as const, label: 'Finalizar', kbd: 'F', onClick: vi.fn() },
  { icon: 'trash-2' as const, label: 'Apagar', danger: true, onClick: vi.fn() },
  { label: 'Sem ícone', onClick: vi.fn() },
];

const svgDe = (html: string) => html.match(/<svg[^>]*>/)?.[0] ?? '';

function itensDoPainel(html: string): string[] {
  const painel = html.slice(html.indexOf('role="menu"'));
  return painel.split(/<button/).slice(1);
}

describe('OverflowMenu', () => {
  it('fechado: só o gatilho ⋯, com nome acessível e o ícone a 14 px', () => {
    const html = renderToStaticMarkup(<OverflowMenu label="Mais ações do corte" items={itens} />);
    expect(html).toContain('aria-label="Mais ações do corte"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<svg[^>]*lucide-ellipsis[^>]*>/);
    expect(html).toMatch(/<svg[^>]*width="14"/);
    expect(html).not.toContain('role="menu"');
  });

  it('aberto: cada item desenha o ícone do nome que recebeu, a 14 px', () => {
    abrirMenu = true;
    const [finalizar, apagar] = itensDoPainel(
      renderToStaticMarkup(<OverflowMenu label="Mais ações" items={itens} />),
    );
    expect(finalizar).toContain('lucide-check-check');
    expect(finalizar).toContain('width="14"');
    expect(finalizar).toContain('>F<');
    expect(apagar).toContain('lucide-trash2');
  });

  it('item perigoso pinta o ícone de erro; o comum fica no tom apagado', () => {
    abrirMenu = true;
    const [finalizar, apagar] = itensDoPainel(
      renderToStaticMarkup(<OverflowMenu label="Mais ações" items={itens} />),
    );
    // O botão perigoso também leva a cor de erro: a conferência é no <svg>.
    expect(svgDe(apagar)).toContain('text-[var(--wb-err)]');
    expect(svgDe(finalizar)).toContain('text-[var(--wb-text-mute)]');
  });

  it('item sem ícone não desenha svg', () => {
    abrirMenu = true;
    const semIcone = itensDoPainel(
      renderToStaticMarkup(<OverflowMenu label="Mais ações" items={itens} />),
    )[2];
    expect(semIcone).toContain('Sem ícone');
    expect(semIcone).not.toContain('<svg');
  });
});

// D-867: o "Mais" do cabeçalho — gatilho com rótulo, da família dos botões
// do cabeçalho, e a ação de tela que o pede.
describe('OverflowMenu com rótulo (D-867)', () => {
  it('o gatilho é um botão do cabeçalho com o ícone ⋯ e o texto, que é o nome dele', () => {
    const html = renderToStaticMarkup(<OverflowMenu texto="Mais" items={itens} />);
    const gatilho = html.match(/<button[^>]*>.*?<\/button>/)?.[0] ?? '';
    expect(gatilho).toContain('class="btn"');
    expect(gatilho).toContain('lucide-ellipsis');
    expect(gatilho).toMatch(/>Mais<\/button>$/);
    expect(gatilho).toContain('aria-haspopup="menu"');
    // Sem aria-label: o nome acessível é o próprio texto visível.
    expect(gatilho).not.toContain('aria-label');
  });

  it('aberto, mostra os mesmos itens do menu de ícone', () => {
    abrirMenu = true;
    const html = renderToStaticMarkup(<OverflowMenu texto="Mais" items={itens} />);
    expect(itensDoPainel(html.slice(html.indexOf('</button>') + 9))).toHaveLength(3);
  });

  it('o cabeçalho desenha a ação com menu como o "Mais", não como botão comum', () => {
    abrirMenu = true;
    const clicou = vi.fn();
    const html = renderToStaticMarkup(
      <AcoesDaTela
        acoes={[
          { icone: 'plus', texto: 'Novo corte', onClick: clicou },
          {
            icone: 'more-horizontal',
            texto: 'Mais',
            menu: [{ icon: 'brain', label: 'Reanalisar', onClick: clicou }],
          },
        ]}
      />,
    );
    expect(html).toContain('Novo corte');
    expect(html).toMatch(/aria-haspopup="menu"[^>]*>.*?Mais<\/button>/);
    expect(html).toContain('role="menu"');
    expect(html).toContain('Reanalisar');
  });
});

// D-867 · comportamento, sem DOM: o componente devolve o elemento, e o teste
// chama o onClick dele — é o mesmo que o React chamaria no clique.
describe('GatilhoDoMenu e ItemDoMenu (D-867)', () => {
  const base = { label: 'Mais ações', compact: false };

  it('o gatilho com rótulo alterna o menu e anuncia se está aberto', () => {
    const alternar = vi.fn();
    const fechado = GatilhoDoMenu({ ...base, texto: 'Mais', open: false, onAlternar: alternar });
    fechado.props.onClick();
    expect(alternar).toHaveBeenCalledOnce();
    expect(fechado.props['aria-expanded']).toBe(false);
    expect(GatilhoDoMenu({ ...base, texto: 'Mais', open: true, onAlternar: alternar }).props['aria-expanded']).toBe(true);
  });

  it('o item ligado fecha o menu e faz a ação', () => {
    const fechar = vi.fn();
    const agir = vi.fn();
    const ligado = ItemDoMenu({ item: { label: 'Reanalisar', onClick: agir }, onFechar: fechar });
    // Sem a marca: um leitor de tela anunciaria todo item como desligado.
    expect(ligado.props['aria-disabled']).toBeUndefined();
    ligado.props.onClick();
    expect(fechar).toHaveBeenCalledOnce();
    expect(agir).toHaveBeenCalledOnce();
  });

  it('o item desligado mostra o motivo e não age — aria-disabled, não disabled', () => {
    const fechar = vi.fn();
    const agir = vi.fn();
    const item = ItemDoMenu({
      item: { label: 'Auditar análise', disabled: true, title: 'A live está sem cortes', onClick: agir },
      onFechar: fechar,
    });
    item.props.onClick();
    expect(agir).not.toHaveBeenCalled();
    expect(fechar).not.toHaveBeenCalled();
    // `disabled` de verdade engole o hover e o foco, e o motivo some (D-439).
    expect(item.props.disabled).toBeUndefined();
    expect(item.props['aria-disabled']).toBe(true);
    expect(item.props.title).toBe('A live está sem cortes');
  });
});

describe('OverflowMenu liga gatilho e itens ao estado aberto (D-867)', () => {
  type Elemento = ReactElement<Record<string, unknown>>;

  it('o gatilho alterna, o item fecha, e quem pediu fica sabendo (D-868)', () => {
    abrirMenu = true;
    espiarAberto = true;
    const avisos: boolean[] = [];
    let arvore: Elemento | undefined;
    function Sonda() {
      arvore = OverflowMenu({
        texto: 'Mais',
        items: itens,
        onAbertoMudou: (aberto) => avisos.push(aberto),
      }) as Elemento;
      return arvore;
    }
    renderToStaticMarkup(<Sonda />);
    const filhos = Children.toArray(arvore!.props.children as ReactNode) as Elemento[];

    // Aberto (abrirMenu), o gatilho fecha — e a linha do corte é avisada.
    const gatilho = filhos.find((e) => e.type === GatilhoDoMenu)!;
    (gatilho.props.onAlternar as () => void)();
    expect(mudancasDoAberto.at(-1)).toBe(false);
    expect(avisos.at(-1)).toBe(false);

    const painel = filhos.find((e) => e.props.role === 'menu')!;
    const [primeiro] = Children.toArray(painel.props.children as ReactNode) as Elemento[];
    expect(primeiro.type).toBe(ItemDoMenu);
    (primeiro.props.onFechar as () => void)();
    expect(mudancasDoAberto.at(-1)).toBe(false);
    expect(avisos).toEqual([false, false]);
  });

  it('o menu repassa o tamanho grande ao gatilho (D-868)', () => {
    let arvore: Elemento | undefined;
    function Sonda() {
      arvore = OverflowMenu({ items: itens, grande: true }) as Elemento;
      return arvore;
    }
    renderToStaticMarkup(<Sonda />);
    const filhos = Children.toArray(arvore!.props.children as ReactNode) as Elemento[];
    expect(filhos.find((e) => e.type === GatilhoDoMenu)!.props.grande).toBe(true);
  });

  it('fechado, o gatilho abre e avisa que abriu', () => {
    espiarAberto = true;
    const avisos: boolean[] = [];
    let arvore: Elemento | undefined;
    function Sonda() {
      arvore = OverflowMenu({ items: itens, onAbertoMudou: (a) => avisos.push(a) }) as Elemento;
      return arvore;
    }
    renderToStaticMarkup(<Sonda />);
    const filhos = Children.toArray(arvore!.props.children as ReactNode) as Elemento[];
    (filhos.find((e) => e.type === GatilhoDoMenu)!.props.onAlternar as () => void)();
    expect(mudancasDoAberto.at(-1)).toBe(true);
    expect(avisos).toEqual([true]);
  });
});

describe('GatilhoDoMenu grande (D-868)', () => {
  it('o gatilho grande tem 32 px — o alvo das ações da linha do corte', () => {
    const base = { label: 'Mais ações', compact: false, open: false, onAlternar: vi.fn() };
    expect(GatilhoDoMenu({ ...base, grande: true }).props.className).toContain('h-8 w-8');
    expect(GatilhoDoMenu(base).props.className).toContain('h-7 w-7');
  });
});
