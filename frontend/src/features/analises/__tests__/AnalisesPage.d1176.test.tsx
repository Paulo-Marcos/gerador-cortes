import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1176 (E-069 H-22; DIRECAO §7.8): a faixa de quatro KPIs, as abas, o select de live com
// carregamento próprio e o "Exportar CSV" como secundária no cabeçalho. Análises é tela de
// leitura: zero primários (PRIMARIOS_POR_TELA).

const h = vi.hoisted(() => ({
  chrome: null as Chrome | null,
  status: { data: undefined as unknown, isLoading: false },
  projetos: { data: undefined as unknown, isLoading: false },
  llm: { data: undefined as unknown },
}));

vi.mock('@/upgrade/UpgradeChrome', () => ({
  useDefinirChrome: (chrome: Chrome) => {
    h.chrome = chrome;
  },
}));
vi.mock('../useAnalises', () => ({
  useYoutubeStatsStatus: () => h.status,
  useProjetosAnalises: () => h.projetos,
  useTelemetriaCortes: () => ({ data: undefined, isLoading: false, isError: false }),
  useLevantamentoDuracao: () => ({ data: [], isLoading: false }),
  useLevantamentoTitulo: () => ({ data: [], isLoading: false }),
  useSincronizarYoutube: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../useLlmCalls', () => ({ useLlmCalls: () => h.llm }));

import { AnalisesPage } from '../AnalisesPage';

function montar(projetosEmCache?: number) {
  const qc = new QueryClient();
  if (projetosEmCache) qc.setQueryData(['projetos'], Array.from({ length: projetosEmCache }, (_, i) => ({ id: `p${i}` })));
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <AnalisesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.chrome = null;
  h.status = { data: undefined, isLoading: false };
  h.projetos = { data: [], isLoading: false };
  h.llm = { data: undefined };
});

describe('Análises na Sala escura (§7.8)', () => {
  it('é tela de leitura: nenhum botão primário (régua do épico)', () => {
    esperarPrimarios(montar(), 'Analises');
  });

  it('a faixa tem quatro KPIs, cada rótulo com seu ícone', () => {
    const html = montar();
    for (const rotulo of ['Publicados 30d', 'Retenção média', 'Casados com corte', 'Custo de IA']) {
      expect(html).toContain(rotulo);
    }
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('sem sincronização, o KPI diz "Sem dados" e o motivo, em vez de um zero', () => {
    const html = montar();
    expect(html).toContain('Sem dados');
    expect(html).toContain('O YouTube ainda não foi sincronizado');
    expect(html).toContain('Nenhuma chamada de IA registrada ainda.');
    expect(html).not.toMatch(/tabular-nums[^>]*>0</);
  });

  it('com dados, mostra o valor e o contexto', () => {
    h.status = {
      isLoading: false,
      data: { total: 4, com_corte: 3, videos: [{ publicado_em: new Date().toISOString(), average_view_percentage: 42 }] },
    };
    h.llm = { data: { chamadas: [{ custo_usd: 0.5 }] } };
    const html = montar();
    expect(html).toContain('3/4');
    expect(html).toContain('42,0');
    expect(html).toContain('US$ 0,50');
    expect(html).toContain('vídeos ligados a um corte do app');
  });

  it('as três abas são abas de verdade e "Proposta × Final" abre selecionada', () => {
    const html = montar();
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Proposta × Final/);
  });

  it('o ponto de aviso só aparece na aba YouTube quando a sync falhou', () => {
    expect(montar()).not.toContain('sincronização com falha');
    h.status = { isLoading: false, data: { total: 0, com_corte: 0, videos: [], falha: { mensagem: 'x', precisa_reautorizar: false } } };
    expect(montar()).toContain('sincronização com falha');
  });

  it('o "Exportar CSV de todas as lives" vai para o cabeçalho, como ação comum (não "forte")', () => {
    montar();
    const acao = h.chrome?.acoes?.find((a) => a.texto === 'Exportar CSV de todas as lives');
    expect(acao).toBeDefined();
    expect(acao?.forte).toBeFalsy();
    const abrir = vi.fn();
    vi.stubGlobal('window', { open: abrir });
    acao?.onClick?.();
    vi.unstubAllGlobals();
    expect(abrir).toHaveBeenCalledWith(expect.stringContaining('telemetria-cortes/export?formato=csv'), '_blank', 'noopener');
  });

  describe('select de live', () => {
    it('carregando: desabilitado, com giro, "Carregando lives…" e a frase ao lado com o N', () => {
      h.projetos = { data: undefined, isLoading: true };
      const html = montar(219);
      const gatilho = html.match(/<button[^>]*role="combobox"[^>]*>/)?.[0] ?? '';
      expect(gatilho).toMatch(/\sdisabled(=|\s|>)/);
      expect(gatilho).toContain('aria-busy="true"');
      expect(html).toContain('Carregando lives…');
      expect(html).toContain('Buscando as 219 lives do canal.');
      expect(html).toContain('animate-spin');
    });

    it('sem saber quantas são, a frase não inventa o número', () => {
      h.projetos = { data: undefined, isLoading: true };
      expect(montar()).toContain('Buscando as lives do canal.');
    });

    it('pronto: habilitado (controle do teste: a mesma regra reprova o gatilho aceso), sem a frase de busca', () => {
      h.projetos = { data: [{ id: 'a', titulo_live: 'Live A' }], isLoading: false };
      const html = montar(219);
      const gatilho = html.match(/<button[^>]*role="combobox"[^>]*>/)?.[0] ?? '';
      expect(gatilho).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(gatilho).not.toContain('aria-busy="true"');
      expect(html).not.toContain('Buscando as');
    });

    it('sem live escolhida, a área de resultado é o estado vazio', () => {
      h.projetos = { data: [{ id: 'a', titulo_live: 'Live A' }], isLoading: false };
      const html = montar();
      expect(html).toContain('data-estado="vazio"');
      expect(html).toContain('Escolha uma live para comparar');
    });
  });
});
