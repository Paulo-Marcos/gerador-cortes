import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { conferenciaDaOrigemKey, corteKey, rodadasDasCenasKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import { cenasEmGeracaoKey } from '../../useGeracoesDaIa';
import { AberturaEditorial } from '../AberturaEditorial';
import { CenasPanel } from '../CenasPanel';
import type { RodadasDasCenas } from '../regrasDaRodada';

// D-1086: na coluna das cenas da Pós, a lista é o único bloco elástico, e cada demanda
// da série D-1070..D-1075 empilhou um bloco fixo em cima dela. Numa janela de 900 px
// sobravam 128 px para a lista: duas cenas. O que é consulta (a legenda das origens, a
// abertura editorial) fecha por padrão e abre num clique; a rodada cabe numa linha.
// Nada some: o conteúdo segue no HTML, dentro do `<details>`.

vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  geracaoIaApi: { gerarCenasClaude: vi.fn(), cenasEmGeracao: vi.fn().mockResolvedValue({ em_geracao: false }) },
  useUltimaGeracao: () => ({ data: undefined }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../useGravarCenas', () => ({ useGravarCenas: () => () => undefined }));
// O tooltip do Radix pede `window`; aqui ele só repassa o filho.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

const DA_IA = { tipo: 'enfase', texto: 'Tese', inicio: 5, fim: 8 };
const rodada = (origem: string, validadas = false) => ({
  origem,
  gerada_em: '2026-11-09T11:56:00',
  validadas,
  validadas_em: null,
  cenas: [DA_IA] as Record<string, unknown>[],
});
const DUAS: RodadasDasCenas = {
  versao: 'v1',
  atual: rodada('claude'),
  anterior: rodada('gemini', true),
  diferencas: { entraram: [], sairam: [], mudaram: [] },
};
const SO_A_ATUAL: RodadasDasCenas = { ...DUAS, anterior: null };

function painel(rodadas: RodadasDasCenas = DUAS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(corteKey('c1'), { id: 'c1', cenas_remotion: { cenas: [DA_IA] } });
  const versao = qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0;
  qc.setQueryData(conferenciaDaOrigemKey('c1', versao), { avisos: [] });
  qc.setQueryData(rodadasDasCenasKey('c1', versao), rodadas);
  qc.setQueryData(cenasEmGeracaoKey('c1'), { corte_id: 'c1', em_geracao: false });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <CenasPanel
        corteId="c1"
        projetoId="p1"
        cenas={[DA_IA as CenaRemotion]}
        cenaAtivaIdx={-1}
        onSeek={vi.fn()}
        onCenasChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

/** O elemento inteiro, da tag de abertura que leva o `data-testid` até o seu fechamento. */
function bloco(html: string, testid: string, tag: string): string {
  const inicio = html.search(new RegExp(`<${tag}[^>]*data-testid="${testid}"`));
  if (inicio < 0) return '';
  const fim = html.indexOf(`</${tag}>`, inicio);
  return html.slice(inicio, fim + tag.length + 3);
}

describe('D-1086 · a legenda das origens recolhida', () => {
  it('fecha por padrão, atrás de "Legenda"', () => {
    const legenda = bloco(painel(), 'legenda-do-plano', 'details');
    expect(legenda).toMatch(/^<details(?![^>]*\bopen\b)[^>]*>/);
    expect(legenda).toMatch(/<summary[^>]*>Legenda/);
  });

  it('nada some: as quatro origens seguem dentro dela', () => {
    const legenda = bloco(painel(), 'legenda-do-plano', 'details');
    for (const texto of ['da IA, conferida', 'pede conferência', 'manual, a IA não mexe', 'riscada']) {
      expect(legenda).toContain(texto);
    }
  });

  it('fica na linha dos números, não numa linha própria', () => {
    const html = painel();
    const numeros = html.slice(html.indexOf('cobertura'), html.indexOf('data-testid="rodada-do-plano"'));
    expect(numeros).toContain('data-testid="legenda-do-plano"');
  });

  it('sem cenas, não há origem para explicar', () => {
    const qc = new QueryClient();
    qc.setQueryData(cenasEmGeracaoKey('c1'), { corte_id: 'c1', em_geracao: false });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <CenasPanel corteId="c1" projetoId="p1" cenas={[]} cenaAtivaIdx={-1} onSeek={vi.fn()} onCenasChange={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(html).not.toContain('legenda-do-plano');
  });
});

describe('D-1086 · a rodada numa linha', () => {
  /** A primeira fileira da rodada: do primeiro filho do bloco até fechar os botões e a fileira. */
  const linha = (html: string) => {
    const rodada = html.slice(html.indexOf('data-testid="rodada-do-plano"'));
    const inicio = rodada.indexOf('<div');
    return rodada.slice(inicio, rodada.indexOf('</div></div>', inicio));
  };

  it('quem gerou, o Desfazer e o Comparar dividem a mesma linha', () => {
    const primeira = linha(painel());
    expect(primeira).toMatch(/rodada atual · Claude/);
    expect(primeira).toContain('data-testid="desfazer-rodada"');
    expect(primeira).toContain('data-testid="comparar-rodadas"');
  });

  it('o Desfazer mostra só o verbo; o rótulo inteiro fica para o leitor de tela', () => {
    const botao = bloco(painel(), 'desfazer-rodada', 'button');
    expect(botao).toMatch(/aria-label="Desfazer rodada\. /);
    // O conteúdo inteiro do botão: o ícone e, depois dele, só o verbo.
    expect(botao).toMatch(/^<button[^>]*><svg[^>]*>.*<\/svg>Desfazer<\/button>$/s);
  });

  it('o Comparar vira ícone com nome acessível', () => {
    const botao = bloco(painel(), 'comparar-rodadas', 'button');
    expect(botao).toContain('aria-label="Comparar com a rodada anterior"');
    // O conteúdo inteiro do botão é o ícone: nenhum texto antes ou depois dele.
    expect(botao).toMatch(/^<button[^>]*><svg[^>]*>.*<\/svg><\/button>$/s);
  });

  it('o motivo do Desfazer desligado segue à vista, logo abaixo da linha', () => {
    const html = painel(SO_A_ATUAL);
    expect(html).toMatch(/<p id="motivo-da-rodada-c1"[^>]*>Não há rodada anterior para voltar\.<\/p>/);
  });
});

describe('D-1086 · a abertura editorial recolhível', () => {
  const ABERTURA = {
    contextualizacao: 'A renda da terra explica o preço da comida.',
    fraseGancho: 'Ninguém fala nisso na escola.',
    fraseGanchoHms: '01:23:45',
  };

  it('fecha por padrão, numa linha com o começo da contextualização', () => {
    const html = renderToStaticMarkup(<AberturaEditorial {...ABERTURA} />);
    expect(html).toMatch(/^<details(?![^>]*\bopen\b)[^>]*aria-label="Abertura editorial do corte"/);
    const resumo = html.slice(html.indexOf('<summary'), html.indexOf('</summary>'));
    expect(resumo).toContain('Abertura');
    expect(resumo).toContain('A renda da terra explica o preço da comida.');
  });

  it('nada some: a contextualização, o gancho e o horário seguem dentro dela', () => {
    const html = renderToStaticMarkup(<AberturaEditorial {...ABERTURA} />);
    const corpo = html.slice(html.indexOf('</summary>'));
    expect(corpo).toContain('Contextualização · 1ª cena');
    expect(corpo).toContain('“Ninguém fala nisso na escola.”');
    expect(corpo).toContain('01:23:45');
  });

  it('só com o gancho, o resumo mostra o gancho', () => {
    const html = renderToStaticMarkup(<AberturaEditorial fraseGancho="Só o gancho" />);
    expect(html.slice(html.indexOf('<summary'), html.indexOf('</summary>'))).toContain('“Só o gancho”');
  });

  it('sem nada preenchido, não ocupa espaço', () => {
    expect(renderToStaticMarkup(<AberturaEditorial contextualizacao="  " />)).toBe('');
  });
});
