import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { conferenciaDaOrigemKey, corteKey, rodadasDasCenasKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import { cenasEmGeracaoKey } from '../../useGeracoesDaIa';
import { CenasPanel } from '../CenasPanel';
import { ComparacaoDasRodadas } from '../RodadaDoPlano';
import {
  descreverCampo,
  haQuantoTempo,
  jaDesfez,
  linhaDaRodada,
  montarBotaoDoDesfazer,
  resumirDiferencas,
  type RodadasDasCenas,
} from '../regrasDaRodada';

// D-1073 (RN-37): o cabeçalho do plano de cenas diz qual rodada está na tela, desfaz e
// refaz pelo mesmo botão e compara com a anterior sem sair da Pós. Tudo vem da API das
// rodadas (D-1071); a validação viaja com a rodada, e o botão avisa o que volta com ela.

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

const AGORA = Date.parse('2026-11-07T12:00:00Z');
const MANUAL = { tipo: 'enfase', texto: 'Escrita à mão', inicio: 20, fim: 24, manual: true };
const DA_IA = { tipo: 'enfase', texto: 'Tese', inicio: 5, fim: 8 };
const SEM_DIFERENCA = { entraram: [], sairam: [], mudaram: [] };

const rodada = (origem: string | null, gerada_em: string | null, validadas = false, cenas: object[] = [DA_IA]) => ({
  origem,
  gerada_em,
  validadas,
  validadas_em: null,
  cenas: cenas as Record<string, unknown>[],
});
const DUAS: RodadasDasCenas = {
  versao: 'v1',
  atual: rodada('claude', '2026-11-07T11:56:00'),
  anterior: rodada('gemini', '2026-11-05T09:00:00', true),
  diferencas: SEM_DIFERENCA,
};
const SO_A_ATUAL: RodadasDasCenas = { ...DUAS, anterior: null };

function painel(rodadas: RodadasDasCenas | Error, { emGeracao = false } = {}) {
  // `retryOnMount: false`: sem ele, a consulta em erro tenta de novo ao montar e o render
  // estático a vê pendente; no navegador o erro chega depois da tentativa.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  qc.setQueryData(corteKey('c1'), { id: 'c1', cenas_remotion: { cenas: [DA_IA] } });
  const versao = qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0;
  qc.setQueryData(conferenciaDaOrigemKey('c1', versao), { avisos: [] });
  if (rodadas instanceof Error) {
    qc.getQueryCache().build(qc, { queryKey: rodadasDasCenasKey('c1', versao) }).setState({ status: 'error', error: rodadas });
  } else {
    qc.setQueryData(rodadasDasCenasKey('c1', versao), rodadas);
  }
  qc.setQueryData(cenasEmGeracaoKey('c1'), { corte_id: 'c1', em_geracao: emGeracao });
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

/** O botão pelo `data-testid`: a tag de abertura inteira, com o `disabled` e o rótulo. */
const botao = (html: string, testid: string) => html.match(new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';

describe('D-1073 · a linha da rodada', () => {
  it('diz a rodada, quem gerou e há quanto tempo', () => {
    expect(linhaDaRodada(DUAS, AGORA)).toBe('rodada atual · Claude · há 4 min');
  });

  it('lê a hora do servidor como UTC: ela chega sem fuso (`utcnow()`)', () => {
    expect(haQuantoTempo('2026-11-07T11:56:00', AGORA)).toBe('há 4 min');
    expect(haQuantoTempo('2026-11-07T11:56:00Z', AGORA)).toBe('há 4 min');
    expect(haQuantoTempo('2026-11-07T08:56:00-03:00', AGORA)).toBe('há 4 min');
    expect(haQuantoTempo('2026-11-07T09:00:00', AGORA)).toBe('há 3 h');
    expect(haQuantoTempo('2026-11-06T11:00:00', AGORA)).toBe('há 1 dia');
    expect(haQuantoTempo('2026-11-07T11:59:40', AGORA)).toBe('agora há pouco');
  });

  it('rodada de antes da D-1071, sem registro: diz que a origem não foi registrada', () => {
    expect(linhaDaRodada({ ...SO_A_ATUAL, atual: rodada(null, null) }, AGORA)).toBe(
      'rodada atual · origem não registrada',
    );
  });

  it('a resposta colada pelo operador aparece como tal', () => {
    expect(linhaDaRodada({ ...SO_A_ATUAL, atual: rodada('manual', '2026-11-07T11:00:00') }, AGORA)).toBe(
      'rodada atual · resposta colada à mão · há 1 h',
    );
  });

  it('aparece no cabeçalho do plano, com os dois botões', () => {
    const html = painel(DUAS);
    expect(html).toMatch(/rodada atual · Claude · há \d+/);
    expect(html).toContain('Desfazer rodada');
    expect(html).toContain('Comparar com a rodada anterior');
  });

  it('a leitura das rodadas falhou: diz que não leu, em vez de sumir com os botões', () => {
    const html = painel(new Error('500'));
    expect(html).toContain('Não foi possível ler as rodadas das cenas');
    expect(html).not.toContain('desfazer-rodada');
  });

  it('corte sem plano e sem rodada guardada não mostra a linha', () => {
    expect(painel({ ...SO_A_ATUAL, atual: rodada(null, null, false, []) })).not.toContain('rodada-do-plano');
  });
});

describe('D-1073 · o Desfazer rodada', () => {
  const montar = (p: Partial<Parameters<typeof montarBotaoDoDesfazer>[0]>) =>
    montarBotaoDoDesfazer({ rodadas: DUAS, emGeracao: false, dirty: false, desfazendo: false, agora: AGORA, ...p });

  it('volta à anterior e diz o que volta com ela: quem gerou e a validação', () => {
    const b = montar({});
    expect(b).toMatchObject({ rotulo: 'Desfazer rodada', icone: 'undo-2', desabilitado: false });
    expect(b.dica).toBe(
      'Volta ao plano anterior (Gemini · há 2 dias). Ele volta validado. Clicar de novo traz este de volta.',
    );
  });

  it('a anterior sem validar avisa que o render final vai esperar', () => {
    const b = montar({ rodadas: { ...DUAS, anterior: rodada('gemini', '2026-11-05T09:00:00', false) } });
    expect(b.dica).toContain('Ele volta sem validar: o render final espera a validação.');
  });

  it('depois de desfazer, o mesmo botão refaz: a anterior é a mais nova', () => {
    const desfeita = { ...DUAS, atual: DUAS.anterior!, anterior: DUAS.atual };
    expect(jaDesfez(desfeita)).toBe(true);
    expect(montar({ rodadas: desfeita })).toMatchObject({ rotulo: 'Refazer rodada', icone: 'redo-2' });
    expect(montar({ rodadas: desfeita }).dica).toMatch(/^Traz de volta o plano mais novo \(Claude · há 4 min\)\./);
  });

  it('sem as horas (rodada antiga) não se sabe se já desfez: o botão diz desfazer', () => {
    expect(jaDesfez({ ...DUAS, atual: rodada(null, null) })).toBe(false);
  });

  it('desabilitado sem rodada anterior, durante a geração, com cenas sem salvar e enquanto troca', () => {
    expect(montar({ rodadas: SO_A_ATUAL })).toMatchObject({ desabilitado: true, dica: 'Não há rodada anterior para voltar.' });
    expect(montar({ emGeracao: true })).toMatchObject({ desabilitado: true, dica: 'Espere as cenas terminarem de ser geradas.' });
    expect(montar({ dirty: true })).toMatchObject({ desabilitado: true, dica: 'Salve as cenas antes de trocar de rodada.' });
    expect(montar({ desfazendo: true })).toMatchObject({ desabilitado: true, trocando: true, motivo: null });
  });

  it('na tela, o motivo de estar desabilitado fica visível, ligado ao botão', () => {
    const html = painel(DUAS, { emGeracao: true });
    expect(html).toMatch(/<p id="motivo-da-rodada-c1"[^>]*>Espere as cenas terminarem de ser geradas\.<\/p>/);
    expect(botao(html, 'desfazer-rodada')).toContain('aria-describedby="motivo-da-rodada-c1"');
    expect(painel(DUAS)).not.toContain('motivo-da-rodada-c1');
  });

  it('na tela: desabilitado sem anterior e durante a geração; habilitado com a anterior', () => {
    expect(botao(painel(DUAS), 'desfazer-rodada')).not.toContain('disabled');
    expect(botao(painel(SO_A_ATUAL), 'desfazer-rodada')).toContain('disabled');
    expect(botao(painel(DUAS, { emGeracao: true }), 'desfazer-rodada')).toContain('disabled');
  });
});

describe('D-1073 · Comparar com a rodada anterior', () => {
  it('desabilitado sem rodada anterior', () => {
    expect(botao(painel(SO_A_ATUAL), 'comparar-rodadas')).toContain('disabled');
    expect(botao(painel(DUAS), 'comparar-rodadas')).not.toContain('disabled');
  });

  it('resume o que entrou, saiu e mudou; iguais, diz que são iguais', () => {
    expect(resumirDiferencas({ entraram: [DA_IA], sairam: [DA_IA, DA_IA], mudaram: [] })).toBe('1 entrou · 2 saíram');
    expect(resumirDiferencas(SEM_DIFERENCA)).toBe('As duas rodadas têm as mesmas cenas.');
  });

  it('o campo que mudou mostra antes → agora; valor composto, só o nome', () => {
    expect(descreverCampo('texto', { texto: 'Tese' }, { texto: 'Antítese' })).toBe('texto: “Tese” → “Antítese”');
    expect(descreverCampo('inicio', { inicio: 5 }, { inicio: 6.5 })).toBe('início: 5 → 6.5');
    expect(descreverCampo('fonte', {}, { fonte: 'IBGE' })).toBe('fonte: — → “IBGE”');
    expect(descreverCampo('itens', { itens: ['a'] }, { itens: ['b'] })).toBe('itens');
  });

  it('mostra por cena o que entrou, o que saiu e o que mudou, e a manual como manual', () => {
    const html = renderToStaticMarkup(
      <ComparacaoDasRodadas
        rodadas={{
          ...DUAS,
          diferencas: {
            entraram: [MANUAL],
            sairam: [{ tipo: 'citacao_autor', texto: 'Saiu daqui', inicio: 30, fim: 33 }],
            mudaram: [{ atual: { ...DA_IA, texto: 'Antítese' }, anterior: DA_IA, campos: ['texto'] }],
          },
        }}
      />,
    );
    expect(html).toContain('1 entrou · 1 saiu · 1 mudou');
    expect(html).toContain('Entraram (só na atual)');
    expect(html).toContain('Saíram (só na anterior)');
    expect(html).toContain('Mudaram');
    expect(html).toMatch(/data-origem="manual"[\s\S]*manual · a IA não mexe[\s\S]*Escrita à mão/);
    expect(html).toContain('Saiu daqui');
    expect(html).toContain('texto: “Tese” → “Antítese”');
    expect(html).toMatch(/data-origem="ia"[\s\S]*da IA/);
  });
});
