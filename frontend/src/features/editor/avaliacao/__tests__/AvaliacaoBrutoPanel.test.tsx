import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { AvaliacaoBruto } from '@/lib/avaliacaoBrutoApi';
import { AvaliacaoBrutoPanel } from '../AvaliacaoBrutoPanel';
import { avaliacaoBrutoKey } from '../useAvaliacaoBruto';

const CORTE = 'corte-1';

const AVALIACAO: AvaliacaoBruto = {
  id: 'av-1',
  corte_id: CORTE,
  projeto_id: 'proj-1',
  nota: 2,
  veredito: 'quebrada',
  parecer: 'A tese chega sem o caso que a motiva.',
  apontamentos: [
    {
      tipo: 'contexto_perdido',
      rotulo: 'Contexto perdido na remoção',
      gravidade: 'grave',
      momento: '01:12',
      descricao: 'A resposta entra sem a pergunta que foi cortada.',
    },
  ],
  duracao_seg: 420,
  duracao_hms: '00:07:00',
  total_emendas: 3,
  removido_seg: 92,
  modelo: 'sonnet',
  criado_em: '2026-08-12T10:00:00',
};

function render(avaliacao: AvaliacaoBruto | null): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(avaliacaoBrutoKey(CORTE), avaliacao);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <AvaliacaoBrutoPanel corteId={CORTE} />
    </QueryClientProvider>,
  );
}

describe('AvaliacaoBrutoPanel (D-447)', () => {
  it('mostra parecer, veredito e os apontamentos da avaliação', () => {
    const html = render(AVALIACAO);

    expect(html).toContain('Estrutura quebrada');
    expect(html).toContain('A tese chega sem o caso que a motiva.');
    expect(html).toContain('Contexto perdido na remoção');
    expect(html).toContain('01:12');
  });

  it('resume o contexto da geração avaliada (duração, emendas, removido)', () => {
    const html = render(AVALIACAO);

    expect(html).toContain('00:07:00');
    expect(html).toContain('3 emendas');
    expect(html).toContain('92s');
  });

  it('usa o rótulo vindo do backend, sem duplicar o vocabulário no front', () => {
    const html = render({
      ...AVALIACAO,
      apontamentos: [
        {
          tipo: 'tipo_novo_do_backend',
          rotulo: 'Rótulo que só o backend conhece',
          gravidade: 'leve',
          momento: '',
          descricao: '',
        },
      ],
    });

    expect(html).toContain('Rótulo que só o backend conhece');
  });

  it('sem apontamentos, diz que nada quebrou em vez de mostrar lista vazia', () => {
    const html = render({ ...AVALIACAO, nota: 5, veredito: 'coesa', apontamentos: [] });

    expect(html).toContain('Nenhum ponto de quebra apontado.');
  });

  it('corte nunca avaliado explica que a avaliação roda no próximo bruto', () => {
    const html = render(null);

    expect(html).toContain('Ainda sem avaliação');
    expect(html).toContain('reavaliar');
  });
});
