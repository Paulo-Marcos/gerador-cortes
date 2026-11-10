import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PainelDoLote } from '../PainelDoLote';
import type { RaiaDoLote } from '../shortsApi';

// D-1098: o motivo de o robô não ter publicado sozinho vem DEPOIS do recado
// ("a aba esta pronta… — Nao publiquei sozinho porque…"). Numa linha só com
// reticências, era exatamente essa parte que sumia, e o lote parecia travado.

const DETALHE =
  'a aba esta pronta no Chrome — confira a data e clique no botao final — ' +
  'Nao publiquei sozinho porque este corte nao tem a capa vertical do TikTok.';

function renderizar() {
  const raias = [
    {
      plataforma: 'tiktok_horizontal',
      rotulo: 'TikTok',
      exige_humano: true,
      aviso: '',
      itens: [
        {
          alvo_id: 'c1',
          alvo_tipo: 'corte',
          plataforma: 'tiktok_horizontal',
          plataforma_rotulo: 'TikTok',
          rotulo: 'CLASSE MÉDIA CONTRA os pobres',
          estado: 'sua_vez',
          agendado_para: '11/11/2026 as 16:00',
          detalhe: DETALHE,
          url: '',
        },
      ],
    },
  ] as unknown as RaiaDoLote[];
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PainelDoLote raias={raias} />
    </QueryClientProvider>,
  );
}

function classesDoDetalhe(html: string): string {
  const achado = html.match(/<p class="([^"]*)"[^>]*>a aba esta pronta/);
  if (!achado) throw new Error('detalhe do item não renderizado');
  return achado[1];
}

describe('detalhe do item do lote', () => {
  it('quebra a linha em vez de cortar o aviso com reticências', () => {
    const classes = classesDoDetalhe(renderizar()).split(' ');

    expect(classes).not.toContain('truncate');
    expect(classes).toContain('break-words');
  });
});
