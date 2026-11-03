import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortsDoCorteKey } from '@/features/shorts/useShortsDoCorte';
import {
  BoletimTecnicoCard,
  BoletimTecnicoPainel,
  type OpcaoDoBoletim,
} from '../BoletimTecnicoCard';
import { boletimTecnicoApi, type BoletimTecnico } from '../boletimTecnico';
import { boletimKey, useBoletimTecnico, useRemedirBoletim } from '../useBoletimTecnico';

// D-1024: o painel, o polling, os cliques e o erro de consulta do boletim técnico.
// O ambiente de teste é `node` (sem DOM): o clique é feito chamando o `onClick` do
// elemento achado na árvore que o componente devolve.

afterEach(() => vi.restoreAllMocks());

const horizontal: OpcaoDoBoletim = { alvo: { tipo: 'corte', id: 'c1' }, rotulo: 'Horizontal' };
const short1: OpcaoDoBoletim = { alvo: { tipo: 'short', id: 's1' }, rotulo: 'Short 1' };

const pronto = {
  estado: 'pronto',
  volume: { integrado_lufs: -14, pico_dbtp: -2, lra_lu: 3, avisos: [] },
  paradas: [],
  emendas: null,
  emendas_aviso: 'O bruto foi gerado de novo depois deste vídeo: renderize para medir as emendas.',
} as unknown as BoletimTecnico;

type Elemento = ReactElement<Record<string, unknown>>;

/** Percorre a árvore devolvida, abrindo os componentes de função sem hooks. */
function achar(no: ReactNode, quer: (e: Elemento) => boolean): Elemento[] {
  if (Array.isArray(no)) return no.flatMap((n) => achar(n, quer));
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  const aqui = quer(el) ? [el] : [];
  let filhos = el.props.children as ReactNode;
  if (typeof el.type === 'function') {
    try {
      filhos = (el.type as (p: unknown) => ReactNode)(el.props);
    } catch {
      /* componente com hook: fica como folha */
    }
  }
  return [...aqui, ...achar(filhos, quer)];
}

const botao = (rotulo: string) => (e: Elemento) =>
  typeof e.props.onClick === 'function' && JSON.stringify(e.props.children ?? '').includes(rotulo);

function card(extra: Partial<Parameters<typeof BoletimTecnicoCard>[0]> = {}) {
  return BoletimTecnicoCard({
    boletim: pronto,
    opcoes: [horizontal, short1],
    escolhido: horizontal,
    onEscolher: () => {},
    onRemedir: () => {},
    ...extra,
  });
}

describe('cliques do card', () => {
  it('"Medir de novo" chama onRemedir e desliga enquanto remede', () => {
    const onRemedir = vi.fn();
    const [medir] = achar(card({ onRemedir }), botao('Medir de novo'));
    (medir.props.onClick as () => void)();
    expect(onRemedir).toHaveBeenCalledTimes(1);

    const [ocupado] = achar(card({ remedindo: true }), botao('Medir de novo'));
    expect(ocupado.props.disabled).toBe(true);
  });

  it('clicar na aba do short escolhe aquele alvo', () => {
    const onEscolher = vi.fn();
    const [aba] = achar(card({ onEscolher }), botao('Short 1'));
    (aba.props.onClick as () => void)();
    expect(onEscolher).toHaveBeenCalledWith(short1);
  });

  it('com um alvo só não há abas', () => {
    expect(achar(card({ opcoes: [horizontal] }), (e) => e.props.role === 'tab')).toHaveLength(0);
  });
});

describe('texto do card', () => {
  const html = (extra: object = {}) => renderToStaticMarkup(card(extra) as ReactElement);

  it('erro da consulta: avisa e não finge que está medindo', () => {
    const texto = html({ erroDaConsulta: true, boletim: undefined });
    expect(texto).toContain('Não consegui consultar o boletim agora.');
    expect(texto).not.toContain('Medindo o vídeo');
  });

  it('sem emendas confiáveis, a tela diz o porquê em vez de calar', () => {
    expect(html()).toContain('renderize para medir as emendas');
  });
});

describe('polling', () => {
  const intervalo = (estado: string | undefined) => {
    const qc = new QueryClient();
    function Sonda() {
      useBoletimTecnico(horizontal.alvo);
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
    );
    const consulta = qc.getQueryCache().find({ queryKey: boletimKey(horizontal.alvo) });
    const opcoes = consulta?.options as unknown as {
      refetchInterval: (c: unknown) => number | false;
    };
    const opcao = opcoes.refetchInterval;
    return opcao({ state: { data: estado ? { estado } : undefined } });
  };

  it('pergunta de novo enquanto mede', () => {
    expect(intervalo('medindo')).toBe(4000);
  });

  it.each(['pronto', 'falhou', 'arquivo_ausente', undefined])('para de perguntar em %s', (e) => {
    expect(intervalo(e)).toBe(false);
  });
});

describe('medir de novo (hook)', () => {
  it('troca o boletim do cache pelo que a rota devolveu (volta a "medindo")', async () => {
    const remedir = vi
      .spyOn(boletimTecnicoApi, 'remedir')
      .mockResolvedValue({ estado: 'medindo' } as BoletimTecnico);
    const qc = new QueryClient();
    qc.setQueryData(boletimKey(horizontal.alvo), pronto);
    let mutar: () => Promise<unknown> = async () => {};
    function Sonda() {
      mutar = useRemedirBoletim(horizontal.alvo).mutateAsync;
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
    );
    await mutar();
    expect(remedir).toHaveBeenCalledWith(horizontal.alvo);
    expect(qc.getQueryData(boletimKey(horizontal.alvo))).toEqual({ estado: 'medindo' });
  });
});

describe('painel', () => {
  function painel(shorts: unknown) {
    const qc = new QueryClient();
    qc.setQueryData(shortsDoCorteKey('c1'), shorts);
    qc.setQueryData(boletimKey({ tipo: 'corte', id: 'c1' }), pronto);
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <BoletimTecnicoPainel corteId="c1" />
      </QueryClientProvider>,
    );
  }

  it('só short renderizado vira aba; o horizontal vem primeiro e é o escolhido', () => {
    const html = painel({
      shorts: [
        { id: 's1', numero: 1, status: 'renderizado' },
        { id: 's2', numero: 2, status: 'rascunho' },
      ],
    });
    expect(html).toContain('Horizontal');
    expect(html).toContain('Short 1');
    expect(html).not.toContain('Short 2');
    expect(html).toMatch(/aria-selected="true"[^>]*>Horizontal/);
  });

  it('sem short renderizado não há abas', () => {
    expect(painel({ shorts: [] })).not.toContain('role="tab"');
  });
});
