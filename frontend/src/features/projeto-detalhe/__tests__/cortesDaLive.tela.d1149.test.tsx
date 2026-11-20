import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { Corte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1149 (E-069 H-16) · A tela dos cortes da live inteira, com o hook de verdade e só as
// fronteiras trocadas (queries, API, chrome), como no teste da D-1038. O que se prova é o
// aceite da §7.2: o mapa ligado à lista, UMA primária no HTML (contando o `data-variant`
// que o Button grava, "primario"), nenhuma sigla e nada de `style` de aparência.

const h = vi.hoisted(() => ({ cortes: [] as unknown[], chrome: undefined as unknown, duracao: 3600 }));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: unknown) => {
    h.chrome = chrome;
  },
}));
const mutacao = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({
    data: { id: 'p1', status: 'analisado', arquivos_limpos: false, titulo_live: 'Pedro e a Igreja no Império', duracao_segundos: h.duracao },
    refetch: vi.fn(),
  }),
  useExportStatus: () => ({ data: { cortes: [] }, refetch: vi.fn() }),
  useProjetoProgressoWS: () => ({}),
  useAbrirPastaProjeto: mutacao,
  useAbrirPasta: mutacao,
  useRefazerTranscricao: mutacao,
  useAnalisarDesviosTodos: () => ({ disparar: vi.fn(), disparado: false }),
  useUploadYouTube: mutacao,
  useMarcarPublicadoYouTube: mutacao,
  useLiberarPublicacao: mutacao,
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: h.cortes, isError: false, error: null, refetch: vi.fn() }),
  useReordenarCortes: mutacao,
  useAprovar: mutacao,
  useAtualizarCorte: mutacao,
}));
vi.mock('@/features/diarizacao/useDiarizacao', () => ({ useAnaliseClaudeEmAndamento: () => false }));
vi.mock('@/hooks/useWarmupWaveforms', () => ({ useWarmupWaveforms: () => undefined }));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: { canais: [] } }) }));
vi.mock('@/features/editor/AdicionarCorteModal', () => ({ AdicionarCorteModal: () => null }));
vi.mock('@/features/projeto-detalhe/AnaliseIaModal', () => ({ AnaliseIaModal: () => null }));
vi.mock('@/features/projeto-detalhe/AuditoriaAnaliseModal', () => ({ AuditoriaAnaliseModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarTiktokModal', () => ({ PublicarTiktokModal: () => null }));

const { default: WorkspaceProjetoPage } = await import('../WorkspaceProjetoPage');

afterEach(() => {
  h.cortes = [];
  h.chrome = undefined;
  h.duracao = 3600;
});

const corte = (id: string, numero: number, status: string, inicio: number, extra: Partial<Corte> = {}) =>
  ({
    id,
    numero,
    status,
    titulo_proposto: `Corte de número ${numero}`,
    inicio_seg: inicio,
    fim_seg: inicio + 600,
    inicio_hms: '00:00:00',
    fim_hms: '00:10:00',
    is_fire: false,
    score: { hook: 8, flow: 7, value: 7 },
    ...extra,
  }) as unknown as Corte;

/** Três cortes: um proposto, um aprovado em produção e um riscado. */
const LIVE = [corte('c1', 1, 'proposto', 0), corte('c2', 2, 'aprovado', 1200), corte('c3', 3, 'rejeitado', 2400)];

function tela(url = '/projetos/p1'): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/projetos/:id" element={<WorkspaceProjetoPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const barra = () => renderToStaticMarkup(<ActionBar barra={(h.chrome as Chrome).barra!} />);
const primarios = (html: string) => (html.match(/<button[^>]*\bdata-variant="primario"/g) ?? []).length;

/** O `<li>` da lista que leva a linha do corte. */
function linhaDaLista(html: string, corteId: string): string {
  const fim = html.indexOf(`id="corte-${corteId}"`);
  return html.slice(html.lastIndexOf('<li', fim), fim);
}

describe('D-1149 · o mapa da live ligado à lista (§7.2)', () => {
  it('o mapa desenha um corte por linha, no ponto em que nasceu, apontando para a linha', () => {
    h.cortes = LIVE;
    const html = tela();
    expect(html).toContain('aria-label="Mapa da live"');
    for (const id of ['c1', 'c2', 'c3']) {
      expect(html).toMatch(new RegExp(`<a data-corte="${id}"[^>]*href="#corte-${id}"`));
      expect(html).toContain(`id="corte-${id}"`);
    }
    // c2 nasceu aos 20 min de uma live de 1 h: 33,33% da pista.
    expect(html).toMatch(/<a data-corte="c2"[^>]*style="--inicio:33.33%;--largura:16.67%"/);
  });

  it('o corte aberto (o da chegada, ?corte=) acende nos DOIS: no mapa e na linha da lista', () => {
    h.cortes = LIVE;
    const html = tela('/projetos/p1?corte=c2');
    expect(html).toMatch(/<a data-corte="c2"[^>]*aria-current="true"/);
    expect(html.match(/<a data-corte="[^"]+"[^>]*aria-current="true"/g)).toHaveLength(1);
    expect(linhaDaLista(html, 'c2')).toContain('aria-current="true"');
    expect(linhaDaLista(html, 'c1')).not.toContain('aria-current');
    expect(html).toContain('Corte 2 · Corte de número 2');
  });

  it('sem corte aberto, ninguém acende; um ?corte= de outra live também não', () => {
    h.cortes = LIVE;
    for (const url of ['/projetos/p1', '/projetos/p1?corte=de-outra-live']) {
      expect(tela(url)).not.toContain('aria-current="true"');
    }
  });

  it('o riscado aparece riscado no mapa e na lista', () => {
    h.cortes = LIVE;
    const html = tela();
    expect(html).toMatch(/<a data-corte="c3"[^>]*data-estado="riscado"/);
    expect(linhaDaLista(html, 'c3')).toContain('data-riscada="true"');
  });

  it('a leitura do mapa diz quanto da live virou corte, sem contar o riscado', () => {
    h.cortes = LIVE;
    const html = tela();
    expect(html).toContain('33% da live virou corte');
    expect(html).toContain('3 cortes · nenhum pronto');
  });

  it('o mapa é o único cartão com fio de luz da tela (§3.1)', () => {
    h.cortes = LIVE;
    // `cc-fio` sozinho, não `cc-fio-2` nem `var(--cc-fio)`.
    expect(tela().match(/[\s"]cc-fio[\s"]/g)).toHaveLength(1);
  });
});

describe('D-1149 · uma só primária no HTML (§5, D-1138)', () => {
  it('a tela não desenha primária nenhuma: na lista a ação é texto', () => {
    h.cortes = [...LIVE, corte('c4', 4, 'aprovado', 3000, { arquivo_clip_path: 'x.mkv', is_pos_producao: 1 })];
    const html = tela();
    expect(primarios(html)).toBe(0);
    expect(html).not.toContain('btn-pri');
    expect(html.match(/data-variant="link-de-acao"/g)).toHaveLength(4);
  });

  it('com a barra da casca, a tela tem exatamente uma primária', () => {
    h.cortes = LIVE;
    const html = tela();
    expect(primarios(html) + primarios(barra())).toBe(1);
    expect(barra()).toContain('Aprovar o proposto');
  });

  it('a live vazia oferece a análise em secundário: a primária é a da barra', () => {
    h.cortes = [];
    const html = tela();
    expect(html).toContain('Analisar com a IA');
    expect(primarios(html) + primarios(barra())).toBe(1);
  });
});

describe('D-1149 · nenhuma sigla, nenhum style de aparência', () => {
  /** Os textos que a tela mostra (fora das tags), sem as teclas dos atalhos. */
  const textos = (html: string) =>
    html
      .replace(/<kbd[^>]*>[^<]*<\/kbd>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

  it('nenhuma palavra em maiúsculas de duas letras ou mais, fora "IA" (nome da coisa, não sigla)', () => {
    h.cortes = LIVE;
    const siglas = textos(tela()).filter((t) => /\b[A-ZÀ-Ú]{2,}\b/.test(t) && t !== 'IA');
    expect(siglas).toEqual([]);
  });

  it('as siglas das etapas não aparecem nem nos atributos', () => {
    h.cortes = LIVE;
    const html = tela();
    for (const sigla of ['BRU', 'CEN', 'GRD', 'OVL', 'FIN', 'THU', 'MET', 'YT'])
      expect(html).not.toMatch(new RegExp(`[">\\s]${sigla}[<"\\s]`));
  });

  it('todo style da tela é geometria por variável CSS (--x), nunca aparência', () => {
    h.cortes = LIVE;
    const estilos = [...tela().matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    // O glifo do lucide traz `flex-shrink:0` de fábrica: é do ícone, não da tela.
    const deAparencia = estilos.filter((s) => s !== 'flex-shrink:0' && !/^--[\w-]+:[^;]+(?:;--[\w-]+:[^;]+)*;?$/.test(s));
    expect(deAparencia).toEqual([]);
  });

  it('nenhum arquivo da pasta escreve style={{ de aparência, nem backdrop-filter', () => {
    const pasta = resolve(__dirname, '..');
    const arquivos = [
      'WorkspaceProjetoPage.tsx',
      'CorteLinhaAp.tsx',
      'PartesDaLinha.tsx',
      'PartesDaTela.tsx',
      'MapaDosCortes.tsx',
      'DialogosDaLinha.tsx',
      'FalhaDosCortes.tsx',
      'SeloNoAr.tsx',
      'SeloDaOrigem.tsx',
    ];
    for (const arquivo of arquivos) {
      // Sem os comentários: eles podem (e devem) dizer por que não há blur aqui.
      const fonte = readFileSync(resolve(pasta, arquivo), 'utf8').replace(/^\s*\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
      expect(fonte, arquivo).not.toMatch(/style=\{\{\s*[a-z]/);
      expect(fonte, arquivo).not.toMatch(/backdrop-(?:filter|blur)/);
      expect(fonte, arquivo).not.toMatch(/fontSize|font-size|text-\[\d/);
    }
  });

  it('o que se aperta é da Sala escura: leva data-sala e o anel de foco próprio', () => {
    h.cortes = LIVE;
    const html = tela();
    const botoes = [...html.matchAll(/<(button|a|article)\b[^>]*>/g)].map((m) => m[0]);
    const semSala = botoes.filter((b) => !b.includes('data-sala'));
    // Vêm de outras pastas, com foco próprio: o ⋯ da linha (OverflowMenu), o gatilho do
    // MenuDeIa (components/ui) e o link dos shorts (features/shorts).
    const deFora = /aria-label="(?:Mais ações do corte|Gerar trechos de todos os cortes)|href="\/shorts\//;
    expect(semSala.filter((b) => !deFora.test(b))).toEqual([]);
  });
});
