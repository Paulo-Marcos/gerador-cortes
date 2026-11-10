import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { SHORTCUTS_REGISTRY } from '@/shared/atalhos/shortcutsRegistry';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { acoesDoEditor } from '../acoesDoEditor';

// D-1088 (E9 do design da etapa Cortes): "Riscar corte (R)" na barra de baixo,
// sem diálogo e apagado quando o corte já está no YouTube; "Excluir corte" sai
// do Mais e do app.

let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

function publicar(riscar?: { onRiscar: () => void; bloqueio?: string | null }) {
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
          onToggleFire={vi.fn()}
          onAprovar={vi.fn()}
          onGerarBruto={vi.fn()}
          riscar={riscar}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return (publicado as Chrome | null)!;
}

describe('Riscar corte na barra do editor', () => {
  it('fica ao lado do Aprovar, com a tecla R, e risca no clique', () => {
    const onRiscar = vi.fn();
    const { secundario } = publicar({ onRiscar }).barra!;
    expect(secundario).toMatchObject({ texto: 'Riscar corte', tecla: 'R', desabilitado: false });
    secundario!.onClick!();
    expect(onRiscar).toHaveBeenCalledOnce();
  });

  it('com o vídeo no YouTube, fica apagado e diz por quê', () => {
    const { secundario } = publicar({ onRiscar: vi.fn(), bloqueio: 'Já está no YouTube' }).barra!;
    expect(secundario).toMatchObject({ desabilitado: true, titulo: 'Já está no YouTube' });
  });

  it('tela que não risca não mostra o botão', () => {
    expect(publicar().barra!.secundario).toBeUndefined();
  });

  it('o Mais não tem mais "Excluir corte"', () => {
    const itens = publicar({ onRiscar: vi.fn() }).acoes!.flatMap((a) => a.menu ?? []);
    expect(itens.map((i) => i.label)).toEqual(['Gerar bruto']);
  });

  it('sem gerar bruto, o topo não ganha um Mais vazio', () => {
    expect(acoesDoEditor({ brutoPronto: false, brutoOcupado: false })).toEqual([]);
  });
});

describe('o atalho R', () => {
  it('continua na tecla R, agora riscando; o id fica pelo overlay gravado', () => {
    const spec = SHORTCUTS_REGISTRY.find((s) => s.id === 'bruto.rejeitar');
    expect(spec).toMatchObject({ key: 'r', screen: 'bruto', description: 'Riscar corte' });
    expect(SHORTCUTS_REGISTRY.some((s) => /excluir corte/i.test(s.description))).toBe(false);
  });
});
