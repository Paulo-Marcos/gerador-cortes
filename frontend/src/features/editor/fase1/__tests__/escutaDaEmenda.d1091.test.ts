import { describe, expect, it } from 'vitest';
import { MARGEM_DA_EMENDA_SEG, ouvirEmenda, type VideoDaEmenda } from '../escutaDaEmenda';

// D-1091: "Ouvir a emenda" toca alguns segundos antes do trecho, pula o que sai e
// toca alguns segundos depois. Um relógio de mentira avança o vídeo quadro a quadro.

function cena() {
  const video = {
    currentTime: 100,
    paused: true,
    isConnected: true,
    ouvintes: new Set<() => void>(),
    addEventListener(_tipo: string, ouvinte: () => void) {
      this.ouvintes.add(ouvinte);
    },
    removeEventListener(_tipo: string, ouvinte: () => void) {
      this.ouvintes.delete(ouvinte);
    },
    play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
  };
  const fila: (() => void)[] = [];
  const relogio = {
    agendar: (passo: () => void) => fila.push(passo),
    cancelar: () => fila.splice(0),
  };
  /** Avança o vídeo `dt` segundos e roda o próximo quadro. */
  const quadro = (dt: number) => {
    if (!video.paused) video.currentTime += dt;
    fila.shift()?.();
  };
  /** Avança o vídeo e só dispara o `timeupdate`: o rAF parado, como em segundo plano. */
  const semQuadro = (dt: number) => {
    if (!video.paused) video.currentTime += dt;
    video.ouvintes.forEach((ouvinte) => ouvinte());
  };
  return { video, relogio, fila, quadro, semQuadro };
}

const TRECHO = { inicio: 305, emenda: 322 };

describe('ouvirEmenda (D-1091)', () => {
  it('começa a margem antes do trecho e toca', () => {
    const { video, relogio } = cena();
    ouvirEmenda(video as VideoDaEmenda, TRECHO, relogio);
    expect(video.currentTime).toBe(305 - MARGEM_DA_EMENDA_SEG);
    expect(video.paused).toBe(false);
  });

  it('no início do trecho pula para a emenda, e pausa a margem depois', () => {
    const { video, relogio, fila, quadro } = cena();
    ouvirEmenda(video as VideoDaEmenda, TRECHO, relogio);
    quadro(1);
    quadro(1);
    expect(video.currentTime).toBe(304);
    quadro(1);
    expect(video.currentTime).toBe(322);
    quadro(1);
    quadro(1);
    expect(video.paused).toBe(false);
    quadro(1);
    expect(video.currentTime).toBe(325);
    expect(video.paused).toBe(true);
    expect(fila).toHaveLength(0);
  });

  it('com o rAF parado (painel em segundo plano), o timeupdate ainda pula e pausa', () => {
    const { video, relogio, semQuadro } = cena();
    ouvirEmenda(video as VideoDaEmenda, TRECHO, relogio);
    for (let i = 0; i < 3; i++) semQuadro(1);
    expect(video.currentTime).toBe(322);
    for (let i = 0; i < 3; i++) semQuadro(1);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(325);
    expect(video.ouvintes.size).toBe(0);
  });

  it('para quando o operador pausa', () => {
    const { video, relogio, fila, quadro } = cena();
    ouvirEmenda(video as VideoDaEmenda, TRECHO, relogio);
    video.pause();
    quadro(0);
    expect(fila).toHaveLength(0);
    expect(video.currentTime).toBe(302);
  });

  it('para quando o operador leva o vídeo para outro lugar', () => {
    const { video, relogio, fila, quadro } = cena();
    ouvirEmenda(video as VideoDaEmenda, TRECHO, relogio);
    video.currentTime = 50;
    quadro(0);
    expect(fila).toHaveLength(0);
    expect(video.paused).toBe(false);
    expect(video.currentTime).toBe(50);
  });

  it('pedir outra emenda encerra a anterior', () => {
    const { video, relogio, fila } = cena();
    ouvirEmenda(video as VideoDaEmenda, TRECHO, relogio);
    ouvirEmenda(video as VideoDaEmenda, { inicio: 600, emenda: 610 }, relogio);
    expect(fila).toHaveLength(1);
    expect(video.currentTime).toBe(597);
  });

  it('o trecho no começo do vídeo não pede tempo negativo', () => {
    const { video, relogio } = cena();
    ouvirEmenda(video as VideoDaEmenda, { inicio: 1, emenda: 4 }, relogio);
    expect(video.currentTime).toBe(0);
  });
});
