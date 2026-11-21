import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { contarPrimarios, contarPrimariosAcesos, esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { RankingLive, RankingLivesResponse, YoutubeLive, YoutubeLivesResponse } from '../api';

// D-1176 (E-069 H-22; DIRECAO §7.8): Ranking e Buscar lives usam `Tabela`, com os quatro
// estados (carregando, vazio, erro, dados). O ranking é leitura (zero primários); Buscar lives
// tem UM primário, "Baixar e processar", e só quando há live selecionada.

vi.mock('@/upgrade/UpgradeChrome', () => ({ useDefinirChrome: () => undefined }));

import { BarraDeSelecao, LiveSearchPage } from '../LiveSearchPage';
import { RankingLivesPage } from '../RankingLivesPage';

const RANK = (n: number, extra: Partial<RankingLive> = {}) =>
  ({
    video_id: `v${n}`,
    titulo: `Live ${n}`,
    youtube_url: `https://youtu.be/v${n}`,
    thumbnail_url: '',
    data_publicacao: '2026-10-01T00:00:00Z',
    duracao_iso: 'PT1H2M3S',
    views: 12_345,
    likes: 800,
    comentarios: 90,
    sentimento_score: 7.5,
    sentimento_destaques: ['ótimo episódio'],
    pontuacao_total: 71.4,
    componentes_pontuacao: { views: 80 },
    embasamento: [{ criterio: 'views' }],
    status: 'pendente',
    ...extra,
  }) as unknown as RankingLive;

const LIVE = (n: number, baixada = false) =>
  ({
    video_id: `s${n}`,
    titulo: `Busca ${n}`,
    youtube_url: `https://youtu.be/s${n}`,
    thumbnail_url: '',
    data_publicacao: '2026-10-01T00:00:00Z',
    duracao_iso: 'PT45M',
    ja_baixado: baixada,
  }) as unknown as YoutubeLive;

function montar(ui: React.ReactElement, semear: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  semear(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <TooltipProvider>{ui}</TooltipProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ranking = (lives: RankingLive[]) =>
  ({ lives, atualizado_em: '2026-11-20T00:00:00Z', janela_meses: 6 }) as unknown as RankingLivesResponse;

describe('Ranking (§7.8)', () => {
  const html = montar(<RankingLivesPage />, (qc) => qc.setQueryData(['ranking-lives'], ranking([RANK(1), RANK(2)])));

  it('é uma Tabela de verdade, com cabeçalho e uma linha por live', () => {
    expect(html).toContain('<table');
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html).toContain('scope="col"');
    expect(html).toContain('Live 1');
    expect(html).toContain('Live 2');
  });

  it('leitura: nenhum botão primário (Baixar é secundário)', () => {
    esperarPrimarios(html, 'Analises');
    expect(html).toContain('Baixar');
  });

  it('cada linha traz a nota, os números e a ação "Entenda a nota"', () => {
    expect(html).toContain('>71<');
    expect(html).toContain('12.3k');
    expect(html).toContain('Entenda a nota');
  });

  it('vazio: o estado vazio diz o que fazer, sem tabela', () => {
    const vazio = montar(<RankingLivesPage />, (qc) => qc.setQueryData(['ranking-lives'], ranking([])));
    expect(vazio).toContain('data-estado="vazio"');
    expect(vazio).toContain('Nenhuma candidata pendente');
    expect(vazio).not.toContain('<table');
  });

  it('carregando: frase do que busca, sem tabela', () => {
    const carregando = montar(<RankingLivesPage />, () => undefined);
    expect(carregando).toContain('data-estado="carregando"');
    expect(carregando).toContain('Gerando o ranking');
  });
});

describe('Buscar lives (§7.8)', () => {
  const chave = ['youtube-lives', { afterDate: '20260501', max: 25 }];
  const resposta = (lives: YoutubeLive[]) => ({ lives }) as unknown as YoutubeLivesResponse;

  it('lista as lives numa Tabela, com situação por selo', () => {
    const html = montar(<LiveSearchPage />, (qc) => qc.setQueryData(chave, resposta([LIVE(1), LIVE(2, true)])));
    expect(html).toContain('<table');
    expect(html).toContain('Busca 1');
    expect(html).toContain('baixada');
    expect(html).toContain('nova');
  });

  it('a barra de seleção só nasce com live marcada (o efeito que marca as novas não roda no SSR)', () => {
    const html = montar(<LiveSearchPage />, (qc) => qc.setQueryData(chave, resposta([LIVE(1)])));
    expect(html).not.toContain('Baixar e processar');
  });

  it('com live marcada, "Baixar e processar" é a ÚNICA primária e está acesa', () => {
    const html = renderToStaticMarkup(
      <BarraDeSelecao selecionadas={[LIVE(1), LIVE(2)]} processando={false} onDesmarcar={() => undefined} onProcessar={() => undefined} />,
    );
    expect(contarPrimarios(html)).toBe(1);
    expect(contarPrimariosAcesos(html)).toBe(1);
    expect(html).toMatch(/data-variant="primario"[^>]*>(<[^>]*>)*Baixar e processar/);
    expect(html).toContain('2 live(s) selecionada(s)');
  });

  it('sem live selecionada não há primário; o "Buscar lives" é secundário', () => {
    const html = montar(<LiveSearchPage />, (qc) => qc.setQueryData(chave, resposta([LIVE(1)])));
    expect(html).toMatch(/data-variant="secundario"[^>]*>(<[^>]*>)*Buscar lives/);
    expect(html.match(/data-variant="primario"/g)).toBeNull();
  });

  it('vazio: estado vazio com o que ajustar', () => {
    const html = montar(<LiveSearchPage />, (qc) => qc.setQueryData(chave, resposta([])));
    expect(html).toContain('data-estado="vazio"');
    expect(html).toContain('Nenhuma live encontrada');
  });

  it('carregando: frase do que busca', () => {
    const html = montar(<LiveSearchPage />, () => undefined);
    expect(html).toContain('Buscando as lives do canal-fonte…');
  });
});
