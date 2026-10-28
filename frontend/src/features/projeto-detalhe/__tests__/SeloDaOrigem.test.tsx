import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';
import { SeloDaOrigem } from '../SeloDaOrigem';

// D-988: o ícone de quem propôs o corte, para o operador comparar as IAs.

const desenhar = (no: ReactElement) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>{no}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

describe('SeloDaOrigem (D-988)', () => {
  it.each([
    ['claude', 'Proposto pelo Claude'],
    ['gemini', 'Proposto pelo Gemini'],
    ['manual', 'Proposto à mão (JSON colado)'],
  ])('a origem %s ganha ícone com a dica "%s"', (origem, dica) => {
    const html = desenhar(<SeloDaOrigem origem={origem} />);
    expect(html).toContain(`title="${dica}"`);
    expect(html).toContain(`aria-label="${dica}"`);
    expect(html).toContain('<svg');
  });

  it.each([null, undefined, 'desconhecida'])('sem origem conhecida (%s) não desenha nada', (o) => {
    expect(renderToStaticMarkup(<SeloDaOrigem origem={o} />)).toBe('');
  });

  it('a linha do corte mostra quem o propôs', () => {
    const linha = (origem: string | null) =>
      desenhar(
        <CorteLinhaAp
          projetoId="p1"
          corte={
            {
              id: 'c7',
              numero: 7,
              status: 'proposto',
              inicio_seg: 0,
              fim_seg: 60,
              origem_analise: origem,
            } as unknown as Corte
          }
          status={statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Pedro II' })}
          onEnviarYoutube={() => {}}
          onInformarUrl={() => {}}
          onLiberarPublicacao={() => {}}
          podeSubir={false}
          podeDescer={false}
          reordenando={false}
          onMover={() => {}}
          enviando={false}
        />,
      );
    expect(linha('gemini')).toContain('Proposto pelo Gemini');
    expect(linha(null)).not.toContain('Proposto');
  });
});
