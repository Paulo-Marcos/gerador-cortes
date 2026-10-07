import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/shared/api';
import type { StatusExportCorte } from '@/types/models';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PublicarTiktokModal,
  esperaPelaPublicacao,
  mensagemDoEnvio,
  paramosNoPublicar,
  useInterruptorDaAbertura,
} from '../PublicarTiktokModal';

// D-893: um caso precisa da linha com o envio já falhado no passo "publicar";
// sem DOM não há como produzir o erro de verdade, então a mutação é trocada só
// nesse caso (o resto usa a real).
const h = vi.hoisted(() => ({ falhaNoPublicar: null as unknown }));
vi.mock('@tanstack/react-query', async (original) => {
  const real = await original<typeof import('@tanstack/react-query')>();
  return {
    ...real,
    useMutation: ((opcoes: Parameters<typeof real.useMutation>[0]) =>
      h.falhaNoPublicar
        ? { isPending: false, isSuccess: false, isError: true, error: h.falhaNoPublicar, mutate: vi.fn() }
        : real.useMutation(opcoes)) as typeof real.useMutation,
  };
});

// D-874: o modal entra no import do arquivo, não no corpo do caso. Importado
// dentro do `it`, o transform a frio do grafo dele (~0,5 s, 95% do caso) corria
// sob o timeout de 5 s e estourava com a máquina carregada. E a chave do cache
// vem da fonte leve: o hook da página do projeto arrastava onze módulos a mais.
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => {
  throw new Error('o modal do TikTok não deve carregar o hook da página do projeto');
});

// D-834: o "publicar sozinho" saiu do lote e subiu para o modal — vale para o
// lote e para o botão Assistido de cada corte, e chega ao backend no pedido.

let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response('{}', { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const shortsApi = async () => (await import('@/features/shorts/shortsApi')).shortsApi;

describe('assistido do corte no TikTok', () => {
  it('manda o "publicar sozinho" que o modal escolheu', async () => {
    await (await shortsApi()).assistidoTiktokHorizontal('c1', {
      agendarPara: '2026-10-01T19:00',
      publicarSozinho: true,
    });

    expect(chamadas[0].url).toBe(
      'http://api.test/api/shorts/corte/c1/publicar/tiktok-horizontal/assistido',
    );
    expect(await chamadas[0].json()).toEqual({
      agendar_para: '2026-10-01T19:00',
      publicar_sozinho: true,
    });
  });

  it('sem escolha, para antes de publicar como sempre', async () => {
    await (await shortsApi()).assistidoTiktokHorizontal('c1');

    expect(await chamadas[0].json()).toEqual({ agendar_para: '', publicar_sozinho: false });
  });
});

describe('PublicarTiktokModal', () => {
  it('mostra o interruptor uma vez, para o lote e para cada corte', () => {
    const corte = { corte_id: 'c1', numero: 1, titulo: 'Um corte' } as StatusExportCorte;

    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <PublicarTiktokModal open onClose={() => {}} projetoId="p1" cortes={[corte]} />
      </QueryClientProvider>,
    );

    expect(html.match(/Publicar sozinho — o robô aperta Publicar/g)).toHaveLength(1);
    expect(html).toContain('Vale para o lote e para o botão Assistido de cada corte');
  });
});

// D-893 (pr-audit pré-release da 0.6.0): o interruptor sobrevivia a fechar e
// reabrir o modal, e o botão de cada corte publicava sem dizer; uma falha
// depois do clique em Publicar devolvia o botão habilitado (post duplicado).
type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children as ReactNode)];
}
const textoDe = (no: ReactNode): string =>
  typeof no === 'string' ? no : Array.isArray(no) ? no.map(textoDe).join('') : isValidElement(no) ? textoDe((no as Elemento).props.children as ReactNode) : '';

describe('publicar sozinho com segurança (D-893)', () => {
  it('o interruptor volta desligado quando o modal fecha e reabre', () => {
    const visto: Record<string, boolean> = {};
    function Sonda() {
      const [passo, setPasso] = useState(0);
      const [ligado, setLigado] = useInterruptorDaAbertura(passo !== 1);
      if (passo === 0 && !ligado) setLigado(true);
      else if (passo === 0) {
        visto.aberto = ligado;
        setPasso(1);
      } else if (passo === 1) {
        visto.fechado = ligado;
        setPasso(2);
      } else visto.reaberto = ligado;
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    expect(visto).toEqual({ aberto: true, fechado: false, reaberto: false });
  });

  it.each([
    ['422 no passo publicar', new ErroDaApi(422, '{"detail":{"passo":"publicar","mensagem":"x"}}', 'Unprocessable'), true],
    ['422 noutro passo', new ErroDaApi(422, '{"detail":{"passo":"sessao","mensagem":"x"}}', 'Unprocessable'), false],
    ['500', new ErroDaApi(500, '{"detail":{"passo":"publicar"}}', 'Server Error'), false],
    ['corpo que não é JSON', new ErroDaApi(422, 'oops', 'Unprocessable'), false],
    ['erro de rede', new TypeError('Failed to fetch'), false],
    ['sem erro', null, false],
  ])('paramosNoPublicar: %s', (_caso, erro, esperado) => {
    expect(paramosNoPublicar(erro)).toBe(esperado);
  });

  it('a linha espera a publicação com a aba vigiada ou depois de parar no Publicar', () => {
    const noPublicar = new ErroDaApi(422, '{"detail":{"passo":"publicar"}}', 'Unprocessable');
    const espera = (envio: Parameters<typeof esperaPelaPublicacao>[0], publicado = false) =>
      esperaPelaPublicacao(envio, publicado);
    expect(espera({ isSuccess: true, data: { vigiando: true }, error: null })).toEqual({ conferindo: false, esperando: true });
    expect(espera({ isSuccess: true, data: { vigiando: false }, error: null }).esperando).toBe(false);
    expect(espera({ isSuccess: false, error: noPublicar })).toEqual({ conferindo: true, esperando: true });
    // Já publicado (a vigília achou o post): ninguém espera mais, o botão solta.
    expect(espera({ isSuccess: false, error: noPublicar }, true)).toEqual({ conferindo: false, esperando: false });
  });

  const corte = { corte_id: 'c1', numero: 1, titulo: 'Um corte' } as StatusExportCorte;
  function botaoDoCorte(ligar: boolean, html = htmlDoModal(ligar)) {
    return html.match(/<button[^>]*title="[^"]*(?:para antes de publicar|APERTA Publicar)[^"]*"[^>]*>.*?<\/button>/)![0];
  }
  function htmlDoModal(ligar: boolean) {
    function Sonda() {
      const arvore = PublicarTiktokModal({ open: true, onClose: () => {}, projetoId: 'p1', cortes: [corte] });
      const [ligou, setLigou] = useState(false);
      if (ligar && !ligou) {
        const rotulo = elementos(arvore).find((e) => e.type === 'label' && textoDe(e).includes('Publicar sozinho'))!;
        const caixa = elementos(rotulo.props.children as ReactNode).find((e) => e.type === 'input')!;
        (caixa.props.onChange as (e: unknown) => void)({ target: { checked: true } });
        setLigou(true);
      }
      return arvore;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Sonda />
      </QueryClientProvider>,
    );
    return html;
  }

  it('desligado, o botão do corte é o Assistido de sempre, que para antes de publicar', () => {
    const botao = botaoDoCorte(false);
    expect(botao).toContain('>Assistido<');
    expect(botao).toContain('lucide-bot');
    expect(botao).toContain('para antes de publicar');
  });

  it('parado depois do clique em Publicar, o botão fica travado enquanto a aba é conferida', () => {
    h.falhaNoPublicar = new ErroDaApi(422, '{"detail":{"passo":"publicar","mensagem":"x"}}', 'Unprocessable');
    try {
      const html = htmlDoModal(false);
      expect(botaoDoCorte(false, html)).toMatch(/^<button[^>]*disabled=""/);
      // A linha diz o que fazer — a orientação, não o 422 cru com o JSON.
      expect(html).toContain('A aba voltou para a tela');
    } finally {
      h.falhaNoPublicar = null;
    }
    expect(botaoDoCorte(false)).not.toMatch(/^<button[^>]*disabled=""/);
  });

  // 2ª pr-audit: o hook era testado sozinho; o modal podia voltar ao useState
  // de antes e nada falhava. Aqui é o PRÓPRIO modal que fecha e reabre.
  it('o próprio modal: ligado, fechado e reaberto, o botão volta a ser o Assistido', () => {
    const vistos: string[] = [];
    function Sonda() {
      const [passo, setPasso] = useState(0);
      const open = passo !== 2;
      const arvore = PublicarTiktokModal({ open, onClose: () => {}, projetoId: 'p1', cortes: [corte] });
      if (passo === 0) {
        const rotulo = elementos(arvore).find((e) => e.type === 'label' && textoDe(e).includes('Publicar sozinho'))!;
        const caixa = elementos(rotulo.props.children as ReactNode).find((e) => e.type === 'input')!;
        (caixa.props.onChange as (e: unknown) => void)({ target: { checked: true } });
        setPasso(1);
      } else if (passo === 1) {
        vistos.push(String(elementos(arvore).find((e) => e.type === 'input' && e.props.checked === true) !== undefined));
        setPasso(2);
      } else if (passo === 2) setPasso(3);
      return passo === 3 ? arvore : null;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Sonda />
      </QueryClientProvider>,
    );
    expect(vistos).toEqual(['true']);
    expect(html).toContain('>Assistido<');
    expect(html).not.toContain('Publicar com o robô');
  });

  it('a mensagem do erro é a orientação, não o JSON', () => {
    const json = (detail: unknown) => JSON.stringify({ detail });
    expect(mensagemDoEnvio(new ErroDaApi(422, json({ passo: 'publicar', mensagem: 'x' }), 'U'))).toMatch(
      /^O robô clicou em Publicar.*marca o corte sozinho/,
    );
    expect(mensagemDoEnvio(new ErroDaApi(422, json({ passo: 'sessao', mensagem: 'Faça login.' }), 'U'))).toBe('Faça login.');
    expect(mensagemDoEnvio(new ErroDaApi(400, json('Este corte já está numa aba do robô'), 'B'))).toBe(
      'Este corte já está numa aba do robô',
    );
    expect(mensagemDoEnvio(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
  });

  // O efeito de perguntar ao servidor não roda sem DOM: a decisão é pura e
  // testada acima; aqui se confere que a linha a usa e que o efeito a obedece.
  it('a linha pergunta ao servidor pela decisão de esperaPelaPublicacao', () => {
    const fonte = readFileSync(resolve(__dirname, '../PublicarTiktokModal.tsx'), 'utf8').replace(/^[ \t]*\/\/.*$/gm, '');
    expect(fonte).toContain('const { conferindo, esperando: esperandoPublicar } = esperaPelaPublicacao(assistido, publicado);');
    expect(fonte).toMatch(/useEffect\(\(\) => \{\s*if \(!esperandoPublicar\) return;/);
  });

  it('ligado, o botão diz que publica e leva o ícone de publicar', () => {
    const botao = botaoDoCorte(true);
    expect(botao).toContain('>Publicar com o robô<');
    expect(botao).toContain('lucide-upload');
    expect(botao).toContain('APERTA Publicar');
  });
});
