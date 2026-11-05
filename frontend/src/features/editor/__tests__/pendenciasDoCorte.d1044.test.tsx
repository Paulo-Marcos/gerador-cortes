import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';

// D-1044: o que ficou aberto viaja com o corte, nas três telas, sem bloquear nada.

const h = vi.hoisted(() => ({
  statusBruto: undefined as { bruto_defasado?: boolean } | undefined,
  avisos: [] as unknown[],
}));

vi.mock('../useBruto', () => ({ useStatusBruto: () => ({ data: h.statusBruto }) }));
vi.mock('../useCortes', () => ({ useCorte: () => ({ dataUpdatedAt: 1 }) }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { avisos: h.avisos } }),
}));

const { listarPendencias, PendenciasDoCorte, retratoDoCorte } = await import('../PendenciasDoCorte');

const LIMPO = { brutoDefasado: false, alertasAbertos: 0, avisosDeCena: 0, totalDeCenas: 2, cenasValidadas: true };
const corteDe = (patch: Partial<Corte> = {}) =>
  ({ id: 'c1', alertas_conferir: [], cenas_remotion: [], cenas_validadas: 0, youtube_video_id: '', ...patch }) as unknown as Corte;

const desenhar = (corte: Corte) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PendenciasDoCorte corte={corte} />
    </QueryClientProvider>,
  );

describe('D-1044 · a lista de pendências', () => {
  it('sem nada aberto, a lista é vazia', () => {
    expect(listarPendencias(LIMPO)).toEqual([]);
  });

  it.each<[string, Partial<typeof LIMPO>, string]>([
    ['bruto defasado', { brutoDefasado: true }, 'os trechos mudaram depois do bruto'],
    ['um conferir', { alertasAbertos: 1 }, '1 conferir'],
    ['dois avisos', { avisosDeCena: 2 }, '2 avisos de cena'],
    ['um aviso', { avisosDeCena: 1 }, '1 aviso de cena'],
    ['cenas por validar', { cenasValidadas: false }, 'cenas por validar'],
  ])('%s entra na lista', (_nome, patch, texto) => {
    expect(listarPendencias({ ...LIMPO, ...patch })).toEqual([texto]);
  });

  it('corte sem cenas não tem o que validar', () => {
    expect(listarPendencias({ ...LIMPO, totalDeCenas: 0, cenasValidadas: false })).toEqual([]);
  });

  it('conta só os alertas abertos e as cenas nos dois formatos do roteiro', () => {
    const alertas = [{ conferido: true }, { conferido: false }] as unknown as Corte['alertas_conferir'];
    const comLista = retratoDoCorte(
      corteDe({ alertas_conferir: alertas, cenas_remotion: [{}, {}] as unknown as Corte['cenas_remotion'] }),
      { brutoDefasado: false, avisosDeCena: 0 },
    );
    expect(comLista).toMatchObject({ alertasAbertos: 1, totalDeCenas: 2 });
    const comRoteiro = retratoDoCorte(corteDe({ cenas_remotion: { cenas: [{}] } as unknown as Corte['cenas_remotion'] }), {
      brutoDefasado: false,
      avisosDeCena: 0,
    });
    expect(comRoteiro.totalDeCenas).toBe(1);
  });
});

describe('D-1044 · as pendências na barra', () => {
  beforeEach(() => {
    h.statusBruto = undefined;
    h.avisos = [];
  });

  it('nada aberto não desenha nada', () => {
    expect(desenhar(corteDe())).toBe('');
  });

  it('mostra tudo o que ficou aberto, lendo o status do bruto e a conferência', () => {
    h.statusBruto = { bruto_defasado: true };
    h.avisos = [{}];
    const html = desenhar(
      corteDe({
        cenas_remotion: [{}] as unknown as Corte['cenas_remotion'],
        alertas_conferir: [{ conferido: false }] as unknown as Corte['alertas_conferir'],
      }),
    );
    expect(html).toContain('os trechos mudaram depois do bruto, 1 conferir, 1 aviso de cena, cenas por validar');
  });

  it('só avisa: não há botão nem nada para travar', () => {
    h.statusBruto = { bruto_defasado: true };
    expect(desenhar(corteDe())).not.toContain('<button');
  });

  it('corte no ar não tem mais pendência a mostrar', () => {
    h.statusBruto = { bruto_defasado: true };
    expect(desenhar(corteDe({ youtube_video_id: 'abc' }))).toBe('');
  });
});
