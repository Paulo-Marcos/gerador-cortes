import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { VIDEOS_BASE } from '@/lib/apiBase';
import { LinhaDoFire } from '../LinhaDoFire';
import type { FireComBruto } from '../shortsApi';

// D-1170 (DIRECAO §7.6): a linha do Fire mostra a capa 9:16 que o contrato traz;
// sem capa, continua o desenho vazio da `Miniatura`.

const FIRE = {
  corte_id: 'c1',
  numero: 1,
  titulo: 'O corte um',
  projeto_id: 'p1',
  projeto_titulo: 'Live de terça',
  tema_central: '',
  duracao_seg: 95,
  bruto_mb: 42,
  tem_bruto: true,
  live_em_disco: true,
  is_fire: true,
  indicado: false,
  finalizado_em: null,
  tem_edicao: false,
  tem_video_final: false,
  redes: [],
  shorts: { total: 0, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 0 },
  capa_path: '',
} satisfies FireComBruto;

const montar = (capa_path: string) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LinhaDoFire fire={{ ...FIRE, capa_path }} liveRodando={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('D-1170 · a capa na linha do Fire', () => {
  it('com capa, a Miniatura 9:16 mostra a versão reduzida servida pelo backend', () => {
    const html = montar('cortes/c1/shorts/s1/capa.jpg');
    const reduzida = `${VIDEOS_BASE}/p1/cortes/c1/shorts/s1/capa.jpg`.replace('/videos/', '/miniaturas/');
    expect(html).toMatch(/data-proporcao="9\/16"/);
    expect(html).toContain(`<img src="${reduzida}"`);
    expect(html).not.toContain('data-sem-capa');
  });

  it('sem capa, fica o desenho vazio, sem <img>', () => {
    const html = montar('');
    expect(html).toContain('data-sem-capa');
    expect(html).not.toContain('<img');
  });
});
