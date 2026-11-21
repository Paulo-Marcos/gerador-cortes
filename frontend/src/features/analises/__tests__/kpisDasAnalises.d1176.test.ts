import { describe, expect, it } from 'vitest';
import type { YoutubeStatsStatus } from '../api';
import { calcularKpis } from '../kpisDasAnalises';

// D-1176 (DIRECAO §7.8): sem dado NÃO é zero. "Sem dados" diz por que; zero é uma medida.

const AGORA = Date.parse('2026-11-20T12:00:00');

function status(videos: Partial<YoutubeStatsStatus['videos'][number]>[], extra: Partial<YoutubeStatsStatus> = {}) {
  return {
    total: videos.length,
    com_corte: 1,
    videos,
    ...extra,
  } as unknown as YoutubeStatsStatus;
}

describe('calcularKpis (D-1176)', () => {
  it('antes da primeira sincronização: três KPIs sem dado, cada um com o seu motivo', () => {
    const k = calcularKpis(status([]), undefined, AGORA);
    for (const medida of [k.publicados30d, k.retencaoMedia, k.casados, k.custoLlm]) {
      expect(medida.valor).toBeNull();
      expect('motivo' in medida && medida.motivo.length).toBeGreaterThan(10);
    }
    expect(k.publicados30d).toMatchObject({ motivo: expect.stringContaining('sincronizado') });
    expect(k.custoLlm).toMatchObject({ motivo: expect.stringContaining('chamada de IA') });
  });

  it('com vídeos sincronizados mas nenhum recente, publicados é um ZERO medido (não "Sem dados")', () => {
    const k = calcularKpis(
      status([{ publicado_em: '2026-01-01T00:00:00', average_view_percentage: 40 }]),
      [],
      AGORA,
    );
    expect(k.publicados30d.valor).toBe(0);
  });

  it('conta só os vídeos dos últimos 30 dias, tira a média da retenção e mostra casados/total', () => {
    const k = calcularKpis(
      status([
        { publicado_em: '2026-11-10T00:00:00', average_view_percentage: 40 },
        { publicado_em: '2026-11-01T00:00:00', average_view_percentage: 50.5 },
        { publicado_em: '2026-08-01T00:00:00', average_view_percentage: null },
      ]),
      undefined,
      AGORA,
    );
    expect(k.publicados30d.valor).toBe(2);
    expect(k.retencaoMedia).toMatchObject({ valor: '45,3', unidade: '%' });
    expect(k.casados.valor).toBe('1/3');
  });

  it('sincronizou, mas nenhum vídeo trouxe retenção: a retenção é "sem dados", o resto não', () => {
    const k = calcularKpis(status([{ publicado_em: '2026-11-10T00:00:00' }]), undefined, AGORA);
    expect(k.retencaoMedia.valor).toBeNull();
    expect(k.publicados30d.valor).toBe(1);
  });

  it('o custo soma as chamadas e sai em pt-BR; uma chamada sem custo ainda é dado', () => {
    const k = calcularKpis(undefined, [{ custo_usd: 1.234 }, { custo_usd: null }, { custo_usd: 0.5 }], AGORA);
    expect(k.custoLlm.valor).toBe('US$ 1,73');
    expect(calcularKpis(undefined, [{ custo_usd: null }], AGORA).custoLlm.valor).toBe('US$ 0,00');
  });
});
