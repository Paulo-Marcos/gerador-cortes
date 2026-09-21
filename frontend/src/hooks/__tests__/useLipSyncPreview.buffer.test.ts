import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUFFER_TTL_MS,
  carregarBuffer,
  segurarBufferDoLipSync,
  soltarBufferDoLipSync,
  srcDoBufferEmCache,
} from '../useLipSyncPreview';

// D-659: o PCM decodificado do preview de lip-sync (centenas de MB num corte
// longo) ficava em memória para sempre depois que o editor fechava — o TTL só
// era conferido na PRÓXIMA chamada, e ninguém chamava de novo.

const ctxFalso = {
  decodeAudioData: async () => ({ duration: 60 }) as AudioBuffer,
} as unknown as AudioContext;

async function decodificar(src: string) {
  await carregarBuffer(ctxFalso, src);
}

describe('retenção do buffer do lip-sync (D-659)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('o último editor a sair libera o áudio depois do prazo', async () => {
    segurarBufferDoLipSync();
    await decodificar('corte-a.flac');
    expect(srcDoBufferEmCache()).toBe('corte-a.flac');

    soltarBufferDoLipSync();
    vi.advanceTimersByTime(BUFFER_TTL_MS - 1);
    expect(srcDoBufferEmCache()).toBe('corte-a.flac');

    vi.advanceTimersByTime(1);
    expect(srcDoBufferEmCache()).toBeNull();
  });

  it('voltar ao editor dentro do prazo mantém o áudio (sem novo decode de 7 s)', async () => {
    segurarBufferDoLipSync();
    await decodificar('corte-b.flac');
    soltarBufferDoLipSync();

    vi.advanceTimersByTime(BUFFER_TTL_MS / 2);
    segurarBufferDoLipSync();
    vi.advanceTimersByTime(BUFFER_TTL_MS);

    expect(srcDoBufferEmCache()).toBe('corte-b.flac');
    soltarBufferDoLipSync();
    vi.advanceTimersByTime(BUFFER_TTL_MS);
    expect(srcDoBufferEmCache()).toBeNull();
  });

  it('enquanto um editor continua aberto, o outro sair não libera nada', async () => {
    segurarBufferDoLipSync();
    segurarBufferDoLipSync();
    await decodificar('corte-c.flac');

    soltarBufferDoLipSync();
    vi.advanceTimersByTime(BUFFER_TTL_MS * 2);
    expect(srcDoBufferEmCache()).toBe('corte-c.flac');

    soltarBufferDoLipSync();
    vi.advanceTimersByTime(BUFFER_TTL_MS);
    expect(srcDoBufferEmCache()).toBeNull();
  });
});
