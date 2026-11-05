import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte, MetadadoCorte } from '@/types/models';

// D-1064: o fio entre os botões da faixa e o hook. O teste do hook chama `desfazerGeracao`
// direto; aqui o clique do botão é quem chama, para o Desfazer não voltar a gravar sem
// levar a tela junto. Sem DOM: o `Button` anota o `onClick` que recebeu.

type Clique = () => void;

const h = vi.hoisted(() => ({
  cliques: {} as Record<string, Clique>,
  oferta: null as object | null,
  desfazerGeracao: vi.fn(),
  setDesfazerIa: vi.fn(),
}));

vi.mock('@/components/ui/button', async (original) => {
  const real = await original<typeof import('@/components/ui/button')>();
  return {
    ...real,
    Button: (props: Parameters<typeof real.Button>[0]) => {
      if (typeof props.children === 'string') h.cliques[props.children] = props.onClick as unknown as Clique;
      return <real.Button {...props} />;
    },
  };
});
vi.mock('../useMetadataCard', async (original) => {
  const real = await original<typeof import('../useMetadataCard')>();
  return {
    ...real,
    useMetadataCard: (props: Parameters<typeof real.useMetadataCard>[0]) => ({
      ...real.useMetadataCard(props),
      desfazerIa: h.oferta,
      desfazerGeracao: h.desfazerGeracao,
      setDesfazerIa: h.setDesfazerIa,
    }),
  };
});

const { MetadataCard } = await import('../MetadataCard');
const { metadataKey } = await import('../useMetadataCard');

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cliente.setQueryData(metadataKey('c1'), {
    id: 'm1',
    corte_id: 'c1',
    is_fire: false,
    titulo_youtube: 'Título da IA',
    descricao_youtube: 'Descrição da IA',
    texto_capa: 'CAPA DA IA',
    tags_youtube: ['ia'],
  } as MetadadoCorte);
  const corte = { id: 'c1', projeto_id: 'p1', numero: 1, titulo_proposto: 'Proposto', desvios: [] } as unknown as Corte;
  return renderToStaticMarkup(
    <QueryClientProvider client={cliente}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <MetadataCard projetoId="p1" cut={corte} variant="modal" />
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.cliques = {};
  h.oferta = { titulo_youtube: 'Título gravado' };
  h.desfazerGeracao.mockClear();
  h.setDesfazerIa.mockClear();
});

describe('a faixa do Desfazer', () => {
  it('o botão Desfazer chama o gesto do hook, e a faixa some', () => {
    expect(renderizar()).toContain('A IA reescreveu');

    h.cliques.Desfazer();

    expect(h.desfazerGeracao).toHaveBeenCalledTimes(1);
    expect(h.setDesfazerIa).toHaveBeenCalledWith(null);
  });

  it('o botão Manter só dispensa a oferta', () => {
    renderizar();

    h.cliques.Manter();

    expect(h.setDesfazerIa).toHaveBeenCalledWith(null);
    expect(h.desfazerGeracao).not.toHaveBeenCalled();
  });

  it('sem oferta para este corte, não há faixa nem botão', () => {
    h.oferta = null;

    expect(renderizar()).not.toContain('A IA reescreveu');
    expect(h.cliques.Desfazer).toBeUndefined();
  });
});
