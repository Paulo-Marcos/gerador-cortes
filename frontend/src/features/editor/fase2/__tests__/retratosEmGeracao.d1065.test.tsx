import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErroDaApi } from '@/shared/api';
import { cenasEmGeracaoKey } from '../../useGeracoesDaIa';
import { CenasPanel } from '../CenasPanel';

// D-1065: a busca de retratos grava sobre as cenas que leu. Com a geração em voo, o resultado
// da IA está para substituí-las, e buscar agora só serviria para ser recusado no fim.

const h = vi.hoisted(() => ({
  avisos: [] as string[],
  falha: undefined as unknown,
  itens: [] as { label: string; onClick?: () => void }[],
}));

vi.mock('@/features/editor/useCenas', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCenas')>()),
  usePreencherRetratosCenas: () => ({
    isPending: false,
    mutate: (_: undefined, { onError }: { onError: (e: unknown) => void }) => onError(h.falha),
  }),
}));
vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  useUltimaGeracao: () => ({ data: undefined }),
}));
vi.mock('@/components/ui/toaster', () => ({
  useToast: () => ({ notify: (texto: string) => h.avisos.push(texto) }),
}));
// Salvar pede o roteador (`useBlocker`) e não é o que este teste olha.
vi.mock('../useGravarCenas', () => ({ useGravarCenas: () => () => undefined }));
// O painel do ⋯ só aparece aberto: aqui ele já vem aberto, com os itens de verdade.
vi.mock('@/components/ui/overflow-menu', async (original) => {
  const real = await original<typeof import('@/components/ui/overflow-menu')>();
  return {
    ...real,
    OverflowMenu: ({ items }: { items: Parameters<typeof real.ItemDoMenu>[0]['item'][] }) => {
      h.itens = items;
      return items.map((item) => (
        <real.ItemDoMenu key={item.label} item={item} onFechar={() => undefined} />
      ));
    },
  };
});

const FICHA = { tipo: 'ficha_biografica', inicio: 0, fim: 5, texto: 'Nietzsche' };
const OUTRA = { tipo: 'barra_inferior', inicio: 0, fim: 5, texto: 'Sem ficha' };

function itemRetratos(emGeracao: boolean, cenas: unknown[]) {
  const qc = new QueryClient();
  qc.setQueryData(cenasEmGeracaoKey('a'), { corte_id: 'a', em_geracao: emGeracao });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <CenasPanel
          corteId="a"
          projetoId="p1"
          cenas={cenas as never}
          cenaAtivaIdx={-1}
          onSeek={() => undefined}
          onCenasChange={() => undefined}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  const item = html.match(/<button(?:(?!<\/button>)[\s\S])*?Retratos(?:(?!<\/button>)[\s\S])*?<\/button>/);
  expect(item, 'o item Retratos sumiu do menu').not.toBeNull();
  return item![0];
}

describe('o item Retratos do menu das cenas', () => {
  it('com a geração em voo, fica desligado e diz o porquê, como o Validar', () => {
    const item = itemRetratos(true, [FICHA]);

    expect(item).toContain('aria-disabled="true"');
    expect(item).toContain('title="Espere as cenas terminarem de ser geradas"');
  });

  it('sem geração, com ficha, segue livre', () => {
    const item = itemRetratos(false, [FICHA]);

    expect(item).not.toContain('aria-disabled="true"');
    expect(item).toContain('title="Buscar retratos das fichas biograficas"');
  });

  it('a geração se explica antes da falta de ficha', () => {
    expect(itemRetratos(true, [OUTRA])).toContain(
      'title="Espere as cenas terminarem de ser geradas"',
    );
    expect(itemRetratos(false, [OUTRA])).toContain('title="Nenhuma ficha biografica para buscar"');
  });
});

describe('quando a busca não grava', () => {
  const clicarRetratos = (falha: unknown) => {
    h.avisos.length = 0;
    h.falha = falha;
    itemRetratos(false, [FICHA]);
    h.itens.find((item) => item.label.startsWith('Retratos'))!.onClick!();
    return h.avisos;
  };

  it('o operador lê a frase do servidor, sem status nem JSON', () => {
    const frase = 'As cenas mudaram durante a busca e os retratos não foram gravados. Busque de novo.';
    const corpo = JSON.stringify({ detail: frase });

    expect(clicarRetratos(new ErroDaApi(400, corpo, 'Bad Request'))).toEqual([frase]);
  });

  it('a falha de rede segue dizendo o que houve', () => {
    expect(clicarRetratos(new Error('Failed to fetch'))).toEqual(['Failed to fetch']);
    expect(clicarRetratos('nada')).toEqual(['Erro ao buscar retratos.']);
  });
});
