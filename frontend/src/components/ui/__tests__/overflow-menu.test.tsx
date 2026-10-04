import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverflowMenu } from '../overflow-menu';
import { AcoesDaTela } from '@/upgrade/ScreenHeader';

// D-861: desde a D-857 o item do menu recebe o NOME do ícone e o menu o desenha
// pelo Icon (antes recebia o componente do lucide e o guardava num `Icon`
// local que escondia o da escala).
//
// Sem DOM no ambiente de teste não há clique: para ver o painel aberto, o
// `useState(false)` do menu começa em true — só neste arquivo e só enquanto
// `abrirMenu` estiver ligado.
let abrirMenu = false;
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: ((inicial: unknown) =>
      react.useState(abrirMenu && inicial === false ? true : inicial)) as typeof react.useState,
  };
});

afterEach(() => {
  abrirMenu = false;
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
