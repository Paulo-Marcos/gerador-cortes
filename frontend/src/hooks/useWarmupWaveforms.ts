import { useEffect, useRef } from 'react';
import { waveformPeaksUrl } from '@/lib/api';

// Concorrência baixa: cada warmup pode disparar um ffmpeg no backend (CPU),
// que concorre com o worker de render. 2 mantém o disco aquecendo sem travar.
const MAX_CONCURRENCY = 2;

/**
 * Aquece (warmup) os proxies de áudio + waveforms dos cortes em background.
 *
 * Ao abrir o projeto, dispara `waveform-peaks` de cada corte com concorrência
 * limitada. O endpoint gera, de uma vez, o proxy FLAC e o JSON de picos — então
 * quando o usuário entra no corte, ambos já estão em cache e a waveform aparece
 * na hora. O backend faz single-flight + cache (I-039), portanto repetir a
 * chamada é idempotente e barato: o "marcador de já gerado" é o próprio cache
 * no disco. O `Set` local apenas evita refazer o fetch já disparado na sessão.
 */
export function useWarmupWaveforms(corteIds: string[], enabled = true): void {
  const warmedRef = useRef<Set<string>>(new Set());
  // Chave estável evita re-disparar o efeito quando o array muda só de referência.
  const key = corteIds.join(',');

  useEffect(() => {
    if (!enabled) return;

    const pendentes = corteIds.filter((id) => !warmedRef.current.has(id));
    if (pendentes.length === 0) return;

    const controller = new AbortController();
    const fila = [...pendentes];

    async function aquecerProximo(): Promise<void> {
      while (fila.length > 0 && !controller.signal.aborted) {
        const id = fila.shift()!;
        warmedRef.current.add(id);
        try {
          await fetch(waveformPeaksUrl(id), { signal: controller.signal });
        } catch {
          // Best-effort: ao abrir o corte ele é regenerado sob demanda.
          if (!controller.signal.aborted) warmedRef.current.delete(id);
        }
      }
    }

    const trabalhadores = Array.from(
      { length: Math.min(MAX_CONCURRENCY, fila.length) },
      aquecerProximo,
    );
    void Promise.all(trabalhadores);

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
