import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';

// D-1176 (DIRECAO §7.8): as abas Desempenho YouTube e Chamadas de IA usam `Tabela` e têm os
// quatro estados (carregando, vazio, erro, dados), cada um com o texto do que fazer.

const h = vi.hoisted(() => ({
  status: { data: undefined as unknown, isLoading: false },
  duracao: { data: undefined as unknown, isLoading: false },
  titulo: { data: undefined as unknown, isLoading: false },
  llm: { data: undefined as unknown, isLoading: false, isError: false, refetch: () => undefined },
}));

vi.mock('../useAnalises', () => ({
  useYoutubeStatsStatus: () => h.status,
  useLevantamentoDuracao: () => h.duracao,
  useLevantamentoTitulo: () => h.titulo,
  useSincronizarYoutube: () => ({ mutate: () => undefined, isPending: false }),
}));
vi.mock('../useLlmCalls', () => ({ useLlmCalls: () => h.llm }));

import { LlmCallsTab } from '../LlmCallsTab';
import { YoutubeDesempenhoTab } from '../YoutubeDesempenhoTab';

const youtube = () =>
  renderToStaticMarkup(
    <ToastProvider>
      <YoutubeDesempenhoTab />
    </ToastProvider>,
  );

beforeEach(() => {
  h.status = { data: { total: 2, com_corte: 1, sincronizado_em: '2026-11-01T10:00:00', stale: true, videos: [] }, isLoading: false };
  h.duracao = { data: [{ faixa: '5-10', videos: 2, views_media: 1234.5, retencao_ponderada_pct: 41, avg_view_duration_media_seg: 150 }], isLoading: false };
  h.titulo = { data: [{ grupo: 'pergunta', faixa: 'sim', videos: 1, views_media: 99, retencao_ponderada_pct: 30 }], isLoading: false };
  h.llm = { data: undefined, isLoading: false, isError: false, refetch: () => undefined };
});

describe('aba Desempenho YouTube', () => {
  it('com dados: duas Tabelas, "Sincronizar" secundário e o selo de desatualizado', () => {
    const html = youtube();
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain('Duração × retenção');
    expect(html).toContain('Pergunta (?)');
    expect(html).toMatch(/data-variant="secundario"[^>]*>(<[^>]*>)*Sincronizar/);
    expect(html).not.toContain('data-variant="primario"');
    expect(html).toContain('desatualizado');
  });

  it('sem estatísticas: estado vazio que manda sincronizar, sem tabela', () => {
    h.status = { data: { total: 0, com_corte: 0, sincronizado_em: null, videos: [] }, isLoading: false };
    const html = youtube();
    expect(html).toContain('data-estado="vazio"');
    expect(html).toContain('Ainda não há estatísticas do YouTube');
    expect(html).not.toContain('<table');
  });

  it('carregando os levantamentos: esqueleto com texto para o leitor de tela', () => {
    h.duracao = { data: undefined, isLoading: true };
    const html = youtube();
    expect(html).toContain('role="status"');
    expect(html).toContain('Carregando duração × retenção…');
  });
});

describe('aba Chamadas de IA', () => {
  const chamada = { id: 1, ts: '2026-11-20T10:00:00', etapa: 'analise', model: 'sonnet', sucesso: true, custo_usd: 0.012, latencia_ms_wall: 1500, tokens_in: 10, tokens_out: 20 };

  it('com chamadas: Tabela com selo ok e a linha abre por um botão acessível', () => {
    h.llm = { ...h.llm, data: { chamadas: [chamada, { ...chamada, id: 2, sucesso: false, erro_tipo: 'timeout' }] } };
    const html = renderToStaticMarkup(<LlmCallsTab />);
    expect(html).toContain('<table');
    expect(html).toContain('$0.0120');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('[--c:var(--cc-ok)]');
    expect(html).toContain('[--c:var(--cc-erro)]');
  });

  it('vazio, carregando e erro têm o seu estado', () => {
    h.llm = { ...h.llm, data: { chamadas: [] } };
    expect(renderToStaticMarkup(<LlmCallsTab />)).toContain('Nenhuma chamada de IA registrada ainda');
    h.llm = { ...h.llm, data: undefined, isLoading: true };
    expect(renderToStaticMarkup(<LlmCallsTab />)).toContain('Buscando as chamadas de IA…');
    h.llm = { ...h.llm, isLoading: false, isError: true };
    const erro = renderToStaticMarkup(<LlmCallsTab />);
    expect(erro).toContain('role="alert"');
    expect(erro).toContain('Tentar de novo');
  });
});
