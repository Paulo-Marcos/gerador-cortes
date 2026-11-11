import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1084: o StatusToggleRow do CommonTopBar ("A · Aprovar", Fire, Leitura,
// "R · Riscar") era código morto — nenhuma tela o renderizava. A barra viva do
// editor é a que o BancadaChrome publica na casca, e ela tem de continuar com
// as mesmas ações depois da remoção.

let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

function publicarComTudo() {
  publicado = null;
  const corte = { id: 'c1', numero: 1, titulo_proposto: 'Corte', status: 'proposto' } as unknown as Corte;
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
          brutoPronto={false}
          brutoOcupado={false}
          onSalvar={vi.fn()}
          onGerarBruto={vi.fn()}
          onToggleFire={vi.fn()}
          leitura={{ ativo: false, autor: '', parte: 1, onAlternar: vi.fn(), onAtualizar: vi.fn() }}
          onAprovar={vi.fn()}
          riscar={{ onRiscar: vi.fn() }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return (publicado as Chrome | null)!;
}

describe('D-1084 — a barra do editor segue com as ações depois da remoção', () => {
  it('Fire e Leitura, Riscar (R), Salvar e Aprovar continuam na barra de baixo', () => {
    const barra = publicarComTudo().barra!;
    expect(barra.alternancias?.map((a) => a.texto)).toEqual(['Fire', 'Leitura']);
    expect(barra.secundario).toMatchObject({ texto: 'Riscar corte', tecla: 'R' });
    expect(barra.terciario).toMatchObject({ titulo: 'Salvar (Ctrl+S)' });
    expect(barra.primario).toMatchObject({ texto: 'Aprovar corte' });
  });

  it('o Mais do topo continua com Gerar bruto', () => {
    const itens = publicarComTudo().acoes!.flatMap((a) => a.menu ?? []);
    expect(itens.map((i) => i.label)).toEqual(['Gerar bruto']);
  });

  it('o CommonTopBar não exporta mais as pílulas mortas, e o ReadingModal fica', async () => {
    const modulo: Record<string, unknown> = await import('../CommonTopBar');
    expect(modulo).not.toHaveProperty('StatusToggleRow');
    expect(modulo).not.toHaveProperty('StatusToggleCompact');
    expect(typeof modulo.ReadingModal).toBe('function');
  });
});
