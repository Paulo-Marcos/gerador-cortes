import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { MotivoAvaliacao } from '@/features/editor/avaliacao/api/avaliacaoCorte';
import {
  alternarMotivo,
  AvaliacaoCorteForm,
  RASCUNHO_VAZIO,
  type RascunhoAvaliacao,
} from '../AvaliacaoCorteForm';
import { motivosAvaliacaoKey } from '../useAvaliacaoCorte';

const MOTIVOS: MotivoAvaliacao[] = [
  { slug: 'borda_inicio', rotulo: 'Começo fora do lugar' },
  { slug: 'titulo', rotulo: 'Título proposto ruim' },
];

function renderForm(rascunho: RascunhoAvaliacao): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(motivosAvaliacaoKey, MOTIVOS);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <AvaliacaoCorteForm rascunho={rascunho} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('alternarMotivo (D-419)', () => {
  it('adiciona motivo ausente', () => {
    expect(alternarMotivo([], 'titulo')).toEqual(['titulo']);
  });

  it('remove motivo já marcado', () => {
    expect(alternarMotivo(['titulo', 'duracao'], 'titulo')).toEqual(['duracao']);
  });

  it('nao duplica ao marcar duas vezes', () => {
    const uma = alternarMotivo([], 'titulo');
    expect(alternarMotivo(alternarMotivo(uma, 'titulo'), 'titulo')).toEqual(['titulo']);
  });
});

describe('AvaliacaoCorteForm (D-419)', () => {
  it('desenha os chips vindos do backend, sem lista duplicada no front', () => {
    const html = renderForm(RASCUNHO_VAZIO);
    expect(html).toContain('Começo fora do lugar');
    expect(html).toContain('Título proposto ruim');
  });

  it('sem nota, nenhuma estrela vem preenchida', () => {
    const html = renderForm(RASCUNHO_VAZIO);
    expect(html).toContain('sem nota');
    expect(html).not.toContain('fill-amber-300');
  });

  it('com nota, as estrelas ate a nota vem preenchidas', () => {
    const html = renderForm({ ...RASCUNHO_VAZIO, voto: 3 });
    expect(html).toContain('3 de 5');
    expect(html.match(/fill-amber-300/g)).toHaveLength(3);
  });

  it('motivo marcado aparece pressionado para leitor de tela', () => {
    const html = renderForm({ voto: 2, motivos: ['titulo'], comentario: '' });
    // Um "true" para a estrela da nota escolhida, outro para o chip marcado.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it('comentario existente chega no textarea', () => {
    const html = renderForm({ voto: 4, motivos: [], comentario: 'cortou cedo' });
    expect(html).toContain('cortou cedo');
  });
});
