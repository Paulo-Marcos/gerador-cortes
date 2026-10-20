import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderIA } from '@/lib/providerIa';
import {
  analiseClaudeKey,
  analiseVezKey,
  opcoesDaAnaliseComAsDuas,
  useQuemAnalisa,
} from '@/features/diarizacao/useDiarizacao';
import {
  quemAnalisa,
  type DesfechoDaAnalise,
  type PedidoDeAnalise,
} from '@/features/diarizacao/analiseComAsDuas';
import { cortesProjetoKey } from '@/shared/chavesDeCache';
import { montarAcaoDeAnalisar } from '../useAcaoDeAnalisar';

// D-977: "Analisar a live" com o Claude, o Gemini ou as duas. A auditoria do
// PR #246 pediu prova do hook: a chave compartilhada, a vez de cada IA, o
// fechamento do modal e o estado que sobrevive a fechar e reabrir.

const DUAS_OK: DesfechoDaAnalise[] = [
  { provider: 'claude', ok: true, totalCortes: 6 },
  { provider: 'gemini', ok: true, totalCortes: 4 },
];
const DUAS_FALHARAM: DesfechoDaAnalise[] = [
  { provider: 'claude', ok: false, erro: 'a' },
  { provider: 'gemini', ok: false, erro: 'b' },
];

describe('análise com as duas IAs no cache', () => {
  it('é uma análise desta live em voo durante as duas chamadas, com a vez de cada IA', async () => {
    const qc = new QueryClient();
    const vistos: { provider: ProviderIA; vez: unknown; emVoo: number }[] = [];
    const analisar = async (provider: ProviderIA) => {
      vistos.push({
        provider,
        vez: qc.getQueryData(analiseVezKey('live-a')),
        emVoo: qc.isMutating({ mutationKey: analiseClaudeKey('live-a'), exact: true }),
      });
      return { total_cortes: 2 };
    };
    const opcoes = opcoesDaAnaliseComAsDuas(qc, 'live-a', vi.fn(), analisar);
    const mutacao = qc.getMutationCache().build(qc, opcoes);

    await mutacao.execute({ usarDiarizacao: true, asDuas: true });

    expect(opcoes.mutationKey).toEqual(analiseClaudeKey('live-a'));
    expect(vistos).toEqual([
      { provider: 'claude', vez: 'claude', emVoo: 1 },
      { provider: 'gemini', vez: 'gemini', emVoo: 1 },
    ]);
    expect(qc.getQueryData(analiseVezKey('live-a'))).toBeNull();
  });

  it('no fim avisa o total de cada IA e recarrega os cortes da live', async () => {
    const qc = new QueryClient();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    const avisar = vi.fn();
    const opcoes = opcoesDaAnaliseComAsDuas(qc, 'live-a', avisar, async (p) => ({
      total_cortes: p === 'claude' ? 6 : 4,
    }));

    await qc.getMutationCache().build(qc, opcoes).execute({ usarDiarizacao: true, asDuas: true });

    expect(avisar).toHaveBeenCalledWith(
      'Análise com as duas IAs: Claude trouxe 6 corte(s); Gemini trouxe 4 corte(s).',
      'success',
    );
    expect(invalidar).toHaveBeenCalledWith({ queryKey: cortesProjetoKey('live-a') });
  });
});

describe('quem gira', () => {
  it('sem análise em voo, nenhum botão', () => {
    expect(quemAnalisa([], 'gemini')).toEqual({ provider: null, asDuas: false });
  });

  it('uma IA só: o provedor pedido', () => {
    expect(quemAnalisa([{ usarDiarizacao: true, provider: 'gemini' }], null)).toEqual({
      provider: 'gemini',
      asDuas: false,
    });
  });

  it('a dupla: a IA da vez e "As duas"', () => {
    expect(quemAnalisa([{ usarDiarizacao: true, asDuas: true }], 'gemini')).toEqual({
      provider: 'gemini',
      asDuas: true,
    });
  });

  function Sonda() {
    const quem = useQuemAnalisa('live-a');
    return <span>{`${quem.provider ?? 'nenhum'}|${quem.asDuas ? 'duas' : 'uma'}`}</span>;
  }

  it('ao reabrir o modal com o Gemini na vez, lê do cache: gira o Gemini e "As duas"', () => {
    const qc = new QueryClient();
    const mutacao = qc.getMutationCache().build<unknown, Error, PedidoDeAnalise, unknown>(qc, {
      mutationKey: analiseClaudeKey('live-a'),
      mutationFn: () => new Promise<never>(() => {}),
    });
    void mutacao.execute({ usarDiarizacao: true, asDuas: true });
    qc.setQueryData(analiseVezKey('live-a'), 'gemini');

    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
    );

    expect(html).toContain('gemini|duas');
  });
});

describe('montarAcaoDeAnalisar', () => {
  const montar = (aoConcluir = vi.fn()) => {
    const analisar = vi.fn();
    const analisarAsDuas = vi.fn();
    const acao = montarAcaoDeAnalisar({
      quem: { provider: null, asDuas: false },
      usarDiarizacao: false,
      aoConcluir,
      analisar,
      analisarAsDuas,
    });
    return { acao, analisar, analisarAsDuas, aoConcluir };
  };

  it('uma IA: pede a análise com o provedor e fecha ao concluir', () => {
    const { acao, analisar, aoConcluir } = montar();
    acao.onGerar('gemini');
    expect(analisar).toHaveBeenCalledWith(
      { usarDiarizacao: false, provider: 'gemini' },
      { onSuccess: aoConcluir },
    );
  });

  it('as duas: fecha quando alguma IA respondeu', () => {
    const { acao, analisarAsDuas, aoConcluir } = montar();
    acao.onGerarAsDuas();
    const [pedido, { onSuccess }] = analisarAsDuas.mock.calls[0];
    expect(pedido).toEqual({ usarDiarizacao: false, asDuas: true });
    onSuccess(DUAS_OK);
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it('as duas falharam: o modal fica aberto', () => {
    const { acao, analisarAsDuas, aoConcluir } = montar();
    acao.onGerarAsDuas();
    analisarAsDuas.mock.calls[0][1].onSuccess(DUAS_FALHARAM);
    expect(aoConcluir).not.toHaveBeenCalled();
  });
});
