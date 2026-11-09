import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { acoesDoEditor } from '../acoesDoEditor';

// D-870 (Onda 3; plano do editor: "excluir fora do topo"): "Gerar bruto" sai
// dos botões soltos do topo para o Mais (⋯), com rótulo. D-1088: "Excluir
// corte" saiu do Mais e do app; riscar, na barra de baixo, é a exclusão.

let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

const mais = (acoes: ReturnType<typeof acoesDoEditor>) => acoes.find((a) => a.texto === 'Mais');

describe('acoesDoEditor', () => {
  it('o topo fica só com o Mais; dentro, gerar bruto', () => {
    const acoes = acoesDoEditor({
      brutoPronto: false,
      brutoOcupado: false,
      onGerarBruto: vi.fn(),
    });
    expect(acoes.map((a) => a.texto)).toEqual(['Mais']);
    expect(mais(acoes)!.menu!.map((i) => i.label)).toEqual(['Gerar bruto']);
    // Ocioso, a tesoura do bruto; o ícone que gira é só enquanto gera.
    expect(mais(acoes)!.menu![0].icon).toBe('scissors');
  });

  it('bruto pronto vira "Regerar bruto"; ocupado gira; o item chama a sua ação', () => {
    const gerar = vi.fn();
    const [bruto] = mais(acoesDoEditor({ brutoPronto: true, brutoOcupado: true, onGerarBruto: gerar }))!.menu!;
    expect([bruto.label, bruto.icon]).toEqual(['Regerar bruto', 'loader']);
    bruto.onClick!();
    expect(gerar).toHaveBeenCalledOnce();
  });

  it('o Mais não tem mais "Excluir corte" nem item destrutivo', () => {
    const itens = mais(acoesDoEditor({ brutoPronto: false, brutoOcupado: false, onGerarBruto: vi.fn() }))!.menu!;
    expect(itens.some((i) => i.label === 'Excluir corte' || i.danger)).toBe(false);
  });

  it('sem gerar bruto, o topo não ganha um Mais vazio', () => {
    expect(acoesDoEditor({ brutoPronto: false, brutoOcupado: false })).toEqual([]);
  });
});

describe('BancadaChrome publica o Mais no topo do editor', () => {
  it('nenhum botão solto: o bruto chega ao cabeçalho dentro do Mais', () => {
    publicado = null;
    const corte = { id: 'c1', numero: 1, titulo_proposto: 'Corte', status: 'proposto' } as unknown as Corte;
    const gerar = vi.fn();
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <BancadaChrome
            projetoId="p1"
            tituloLive="Live"
            cortes={[corte]}
            corte={corte}
            exportStatus={[]}
            caminhoDoCorte={() => '/'}
            sub=""
            fire={false}
            sujo={false}
            salvando={false}
            brutoPronto
            brutoOcupado
            onToggleFire={vi.fn()}
            onAprovar={vi.fn()}
            onGerarBruto={gerar}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const acoes = (publicado as Chrome | null)!.acoes!;
    expect(acoes.map((a) => a.texto)).toEqual(['Mais']);
    const itens = acoes[0].menu!;
    // O estado do bruto chega ao Mais: pronto vira "Regerar", ocupado gira.
    const bruto = itens.find((i) => i.label === 'Regerar bruto')!;
    expect(bruto.icon).toBe('loader');
    bruto.onClick!();
    expect(gerar).toHaveBeenCalledOnce();
    expect(itens.map((i) => i.label)).toEqual(['Regerar bruto']);
  });
});
