// D-905: o ícone da rede no cartão do Fire acende só com o corte inteiro no ar.
import { describe, expect, it } from 'vitest';
import { sinaisDasRedes } from '../sinaisDasRedes';
import type { FireComBruto } from '../shortsApi';

function fire(parcial: Partial<FireComBruto> = {}): FireComBruto {
  return {
    corte_id: 'c1',
    projeto_id: 'p1',
    projeto_titulo: 'Live 1',
    numero: 1,
    titulo: '',
    tema_central: '',
    duracao_seg: 60,
    tem_bruto: true,
    bruto_mb: 10,
    is_fire: true,
    indicado: false,
    tem_video_final: false,
    live_em_disco: true,
    tem_edicao: false,
    finalizado_em: null,
    shorts: { total: 3, sugerido: 0, aprovado: 1, rejeitado: 0, renderizado: 2 },
    redes: [
      { plataforma: 'youtube_shorts', publicados: 2, completa: true },
      { plataforma: 'tiktok', publicados: 1, completa: false },
      { plataforma: 'instagram_reels', publicados: 0, completa: false },
    ],
    ...parcial,
  };
}

describe('sinaisDasRedes', () => {
  it('mostra as três redes do short, na ordem da tela', () => {
    expect(sinaisDasRedes(fire()).map((r) => [r.id, r.rotulo])).toEqual([
      ['youtube_shorts', 'YouTube'],
      ['tiktok', 'TikTok'],
      ['instagram_reels', 'Instagram'],
    ]);
  });

  it('acende só a rede que o backend deu por completa', () => {
    expect(sinaisDasRedes(fire()).map((r) => r.ativa)).toEqual([true, false, false]);
  });

  it('o tooltip conta quantos dos prontos já subiram', () => {
    const [youtube, tiktok] = sinaisDasRedes(fire());
    expect(youtube.titulo).toBe('Os 2 shorts prontos já estão no YouTube');
    expect(tiktok.titulo).toBe('1 de 2 shorts prontos no TikTok');
  });

  it('com um short só, fala no singular', () => {
    const [youtube] = sinaisDasRedes(
      fire({
        shorts: { total: 1, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 1 },
        redes: [{ plataforma: 'youtube_shorts', publicados: 1, completa: true }],
      }),
    );
    expect(youtube.titulo).toBe('O short pronto já está no YouTube');
  });

  it('sem short pronto, nada acende e o tooltip diz por quê', () => {
    const sinais = sinaisDasRedes(
      fire({
        shorts: { total: 2, sugerido: 2, aprovado: 0, rejeitado: 0, renderizado: 0 },
        redes: [],
      }),
    );
    expect(sinais.every((r) => !r.ativa)).toBe(true);
    expect(sinais[1].titulo).toBe('Nenhum short pronto para subir no TikTok');
  });

  it('backend antigo, sem `redes`: tudo apagado em vez de quebrar', () => {
    const { redes: _semRedes, ...semRedes } = fire();
    const sinais = sinaisDasRedes(semRedes as FireComBruto);
    expect(sinais.map((r) => r.ativa)).toEqual([false, false, false]);
  });
});
