// D-987: o ícone da rede no card da Biblioteca acende só com a live inteira no ar.
import { describe, expect, it } from 'vitest';
import { sinaisDasRedesDoProjeto } from '../sinaisDasRedesDoProjeto';
import type { Projeto } from '@/types/models';

function projeto(parcial: Partial<Projeto> = {}): Projeto {
  return {
    total_video_pronto: 3,
    redes_do_horizontal: [
      { plataforma: 'youtube', publicados: 3, completa: true },
      { plataforma: 'tiktok_horizontal', publicados: 1, completa: false },
    ],
    ...parcial,
  } as Projeto;
}

describe('sinaisDasRedesDoProjeto', () => {
  it('mostra as duas redes do horizontal, na ordem da tela', () => {
    expect(sinaisDasRedesDoProjeto(projeto()).map((r) => [r.id, r.rotulo])).toEqual([
      ['youtube', 'YouTube'],
      ['tiktok_horizontal', 'TikTok'],
    ]);
  });

  it('acende só a rede que o backend deu por completa', () => {
    expect(sinaisDasRedesDoProjeto(projeto()).map((r) => r.ativa)).toEqual([true, false]);
  });

  it('o tooltip conta quantos dos cortes prontos já subiram', () => {
    const [youtube, tiktok] = sinaisDasRedesDoProjeto(projeto());
    expect(youtube.titulo).toBe('Os 3 cortes prontos já estão no YouTube');
    expect(tiktok.titulo).toBe('1 de 3 cortes prontos no TikTok');
  });

  it('com um corte só, fala no singular', () => {
    const [youtube] = sinaisDasRedesDoProjeto(
      projeto({
        total_video_pronto: 1,
        redes_do_horizontal: [{ plataforma: 'youtube', publicados: 1, completa: true }],
      }),
    );
    expect(youtube.titulo).toBe('O corte pronto já está no YouTube');
  });

  it('sem corte pronto, nada acende e o tooltip diz por quê', () => {
    const sinais = sinaisDasRedesDoProjeto(
      projeto({ total_video_pronto: 0, redes_do_horizontal: [] }),
    );
    expect(sinais.every((r) => !r.ativa)).toBe(true);
    expect(sinais[1].titulo).toBe('Nenhum corte pronto para subir no TikTok');
  });

  it('backend antigo, sem `redes_do_horizontal`: tudo apagado em vez de quebrar', () => {
    const { redes_do_horizontal: _sem, ...semRedes } = projeto();
    expect(sinaisDasRedesDoProjeto(semRedes as Projeto).map((r) => r.ativa)).toEqual([
      false,
      false,
    ]);
  });
});
