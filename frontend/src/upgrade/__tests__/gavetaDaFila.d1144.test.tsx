import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOTE_KEY } from '@/features/shorts/useLotePublicacao';
import type { JobEstado, QueueJob } from '@/shared/filaGlobal/useWorkbenchQueue';
import { dividirNosTresGrupos, posicaoNaFila, resumoDaFila } from '../cartaoDaFila';

// D-1144 (E-069 H-14, DIRECAO §7.11): a gaveta da fila é o `Dialog lateral` com três grupos:
// Agora, Esperando e Prontos nesta sessão. O ambiente é `node` (sem DOM): aqui vai o que o
// servidor desenha; foco preso, Esc e foco de volta são do Radix e do `Dialog` (testado em
// `components/ui/__tests__/dialog.test.tsx`).

const h = vi.hoisted(() => ({ jobs: [] as unknown[], grupos: [] as unknown[] }));

vi.mock('@/shared/filaGlobal/useWorkbenchQueue', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('@/shared/filaGlobal/useWorkbenchQueue')>()),
  useWorkbenchQueue: () => ({
    jobs: h.jobs,
    grupos: h.grupos,
    cancelJob: vi.fn(),
    removeJob: vi.fn(),
  }),
}));

import { agruparFila } from '@/shared/filaGlobal/useWorkbenchQueue';
import { GavetaDaFila } from '../GavetaDaFila';

function job(id: string, estado: JobEstado, extra: Partial<QueueJob> = {}): QueueJob {
  return {
    id,
    tipo: 'render',
    familia: 'midia',
    corteId: id,
    projetoId: '265',
    alvo: `265 · corte ${id}`,
    rotuloTipo: 'render',
    rotulo: `265 · corte ${id} → render`,
    estado,
    progresso: 0,
    etapa: '',
    erro: '',
    terminalDesde: null,
    iniciadoEm: 1,
    atualizadoEm: 1,
    historico: [],
    ausenteDesde: null,
    ...extra,
  };
}

const JOBS = [
  job('1', 'rodando', { progresso: 42, etapa: 'overlay 4/7' }),
  job('2', 'aguardando'),
  job('3', 'aguardando'),
  job('4', 'concluido', { progresso: 100 }),
];

function desenhar(jobs: QueueJob[], extras: Partial<Parameters<typeof GavetaDaFila>[0]> = {}) {
  h.jobs = jobs;
  h.grupos = agruparFila(jobs);
  const cliente = new QueryClient();
  cliente.setQueryData(LOTE_KEY, { lote: null });
  return renderToStaticMarkup(
    <QueryClientProvider client={cliente}>
      <GavetaDaFila aberta aoFechar={() => {}} aoAbrirTelaCheia={() => {}} {...extras} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.jobs = [];
  h.grupos = [];
});

describe('a gaveta é o Dialog lateral (§7.11)', () => {
  const html = desenhar(JOBS);

  it('é um diálogo de 432 px encostado à direita, com o título e o resumo em uma linha', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('w-[432px]');
    expect(html).toContain('right-3');
    expect(html).toMatch(/<h2[^>]*>Fila de processamento<\/h2>/);
    expect(html).toMatch(/<p[^>]*>1 em curso · 2 esperando · 1 pronto<\/p>/);
    expect(html).toContain('aria-label="Fechar"');
  });

  it('fechada, não desenha nada (nem o véu)', () => {
    expect(desenhar(JOBS, { aberta: false })).toBe('');
  });

  it('o pé diz que os renders seguem e leva "Tela cheia"; não tem primária', () => {
    expect(html).toContain('Os renders seguem com a gaveta fechada.');
    expect(html).toContain('Tela cheia');
    expect(html).not.toContain('data-variant="primario"');
  });

  it('o ⌘J da casca e o fechar do Radix não dependem do HTML: o conteúdo alternativo (vitrine) substitui os grupos', () => {
    const vitrine = desenhar(JOBS, { children: <p>vitrine</p> });
    expect(vitrine).toContain('vitrine');
    expect(vitrine).not.toContain('Prontos nesta sessão');
  });
});

describe('os três grupos', () => {
  const html = desenhar(JOBS);
  const secao = (nome: string) => html.match(new RegExp(`<section aria-label="${nome}".*?</section>`, 's'))?.[0] ?? '';

  it('Agora: selo em curso, barra com percentual, a etapa e "Cancelar"', () => {
    const agora = secao('Agora');
    expect(agora).toContain('265 · corte 1');
    expect(agora).toContain('data-tom="curso"');
    expect(agora).toContain('role="progressbar"');
    expect(agora).toContain('aria-valuenow="42"');
    expect(agora).toContain('42%');
    expect(agora).toContain('overlay 4/7');
    expect(agora).toMatch(/<button[^>]*>Cancelar<\/button>/);
  });

  it('Esperando: a posição na fila em selo inerte e o ⋯', () => {
    const esperando = secao('Esperando');
    expect(esperando.match(/data-tom="inerte"/g)).toHaveLength(2);
    expect(esperando).toContain('>1º<');
    expect(esperando).toContain('>2º<');
    expect(esperando).toContain('aria-label="Mais ações de 265 · corte 2"');
  });

  it('Prontos nesta sessão: selo ok, "Ver" e tirar da lista', () => {
    const prontos = secao('Prontos nesta sessão');
    expect(prontos).toContain('data-tom="ok"');
    expect(prontos).toContain('>Ver<');
    expect(prontos).toContain('aria-label="Tirar 265 · corte 4 da lista"');
  });

  it('grupo vazio não aparece, e sem nada na fila a gaveta diz isso', () => {
    const so = desenhar([job('9', 'rodando', { progresso: 5 })]);
    expect(so).toContain('aria-label="Agora"');
    expect(so).not.toContain('aria-label="Esperando"');
    expect(so).not.toContain('aria-label="Prontos nesta sessão"');
    expect(desenhar([])).toContain('Nada rodando agora.');
  });

  it('desfecho que não é "pronto" (erro, perdido, cancelado) fica em Prontos, com o tom do próprio estado', () => {
    const prontos = desenhar([job('5', 'erro', { erro: 'ffmpeg caiu' }), job('6', 'perdido'), job('7', 'cancelado')]).match(
      /<section aria-label="Prontos nesta sessão".*?<\/section>/s,
    )?.[0];
    expect(prontos).toContain('data-tom="erro"');
    expect(prontos).toContain('ffmpeg caiu');
    expect(prontos).toContain('data-tom="convite"');
    expect(prontos?.match(/data-tom="inerte"/g)).toHaveLength(1);
  });

  it('o detalhe por execução segue atrás do clique do título (aria-expanded)', () => {
    expect(secao('Agora')).toContain('aria-expanded="false"');
  });
});

describe('a regra pura dos grupos (cartaoDaFila)', () => {
  const grupos = agruparFila(JOBS);

  it('divide o que anda, o que espera e o que terminou', () => {
    const { agora, esperando, prontos } = dividirNosTresGrupos(grupos);
    expect([agora.length, esperando.length, prontos.length]).toEqual([1, 2, 1]);
  });

  it('o resumo só nomeia o que existe e conta o lote', () => {
    expect(resumoDaFila(grupos, false)).toBe('1 em curso · 2 esperando · 1 pronto');
    expect(resumoDaFila(agruparFila([job('1', 'concluido'), job('2', 'erro')]), false)).toBe('2 prontos');
    expect(resumoDaFila([], false)).toBe('nada na fila');
    expect(resumoDaFila([], true)).toBe('lote de publicação');
  });

  it('a posição é 1-based, com o ordinal', () => {
    expect([0, 1, 2].map(posicaoNaFila)).toEqual(['1º', '2º', '3º']);
  });
});
