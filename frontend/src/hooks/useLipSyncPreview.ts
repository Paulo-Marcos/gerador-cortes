import { useEffect, useRef, type RefObject } from 'react';

interface Options {
  /** Liga o preview: muta o vídeo e passa a tocar o áudio do proxy deslocado. */
  enabled: boolean;
  /** Tempo de vídeo (s) correspondente ao início do proxy de áudio. */
  proxyStartSec: number;
  /** Offset de lip-sync (ms). Positivo atrasa o áudio; negativo adianta. */
  offsetMs: number;
}

type AudioCtxCtor = typeof AudioContext;

/**
 * Cache de UM buffer decodificado por vez (chaveado pela URL do proxy). O FLAC
 * decodificado ocupa memória (~PCM f32); manter só o corte atual evita acúmulo
 * ao navegar entre cortes. Trocar de corte/refresh muda a URL e substitui aqui.
 *
 * D-230: entrada expira por TTL e uma promise que rejeita é evictada — sem isso,
 * uma falha de fetch/decode ficava grudada e o mesmo src nunca mais re-tentava.
 */
const BUFFER_TTL_MS = 5 * 60 * 1000;
let bufferCache: { src: string; promise: Promise<AudioBuffer>; ts: number } | null = null;

function carregarBuffer(ctx: AudioContext, src: string): Promise<AudioBuffer> {
  const agora = Date.now();
  if (bufferCache?.src === src && agora - bufferCache.ts < BUFFER_TTL_MS) {
    return bufferCache.promise;
  }
  const promise = fetch(src)
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx.decodeAudioData(ab));
  const entry = { src, promise, ts: agora };
  bufferCache = entry;
  // Evicta a própria entrada se ela ainda for a corrente e a promise falhar,
  // permitindo re-tentar em vez de servir a rejeição em cache.
  promise.catch(() => {
    if (bufferCache === entry) bufferCache = null;
  });
  return promise;
}

/**
 * Sincroniza o áudio do proxy do corte ao `<video>` aplicando o offset de
 * lip-sync, para o usuário OUVIR a correção antes de renderizar (F-063).
 *
 * Mantém `audioTime = videoTime - proxyStartSec - offsetSec` — a mesma relação
 * que `build_audio_offset_cmd` grava no render final. Mudar `offsetMs`
 * re-sincroniza na hora, então o ajuste é audível ao vivo.
 *
 * D-147: usa a **Web Audio API** (decode + `AudioBufferSourceNode`) em vez do
 * elemento `<audio>`. O proxy é um FLAC sem seektable; o seek nativo do
 * `<audio>` em FLAC é não-confiável — restava tocando do início e/ou engasgava
 * a cada re-fetch. Decodificado em memória, dá pra tocar a partir de qualquer
 * offset com precisão de amostra, sem buffering nem seek de media element. Cada
 * play/seek cria um source novo (nós de buffer são one-shot) começando no
 * `alvo` correto; pause/desligar param o source.
 */
export function useLipSyncPreview(
  videoRef: RefObject<HTMLVideoElement>,
  audioRef: RefObject<HTMLAudioElement>,
  { enabled, proxyStartSec, offsetMs }: Options,
): void {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    if (!enabled) {
      video.muted = false;
      return;
    }

    const src = audio.currentSrc || audio.src;
    if (!src) return;

    const Ctor: AudioCtxCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;

    let cancelado = false;
    let buffer: AudioBuffer | null = null;
    let source: AudioBufferSourceNode | null = null;

    const offsetSec = offsetMs / 1000;
    const alvoAudioTime = () => video.currentTime - proxyStartSec - offsetSec;

    const pararSource = () => {
      if (source) {
        try {
          source.stop();
        } catch {
          // já parado
        }
        source.disconnect();
        source = null;
      }
    };

    // (Re)inicia a reprodução a partir do ponto do vídeo. one-shot: descarta o
    // source anterior e cria um novo posicionado no `alvo`.
    const iniciarSource = () => {
      pararSource();
      if (!buffer) return;
      const alvo = alvoAudioTime();
      if (alvo < 0 || alvo >= buffer.duration) return; // fora da janela do proxy
      void ctx.resume();
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.playbackRate.value = video.playbackRate || 1;
      node.connect(ctx.destination);
      node.start(0, alvo);
      source = node;
    };

    carregarBuffer(ctx, src)
      .then((buf) => {
        if (cancelado) return;
        buffer = buf;
        video.muted = true;
        if (!video.paused) iniciarSource();
      })
      .catch(() => {
        // Falha de fetch/decode: preview silenciosamente não toca (não quebra o editor).
      });

    const onPlay = () => iniciarSource();
    const onPause = () => pararSource();
    const onSeek = () => {
      if (video.paused) pararSource();
      else iniciarSource();
    };
    const onRate = () => {
      if (source) source.playbackRate.value = video.playbackRate || 1;
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    // `seeked` (não `seeking`): reposiciona uma vez, após o seek do vídeo concluir.
    video.addEventListener('seeked', onSeek);
    video.addEventListener('ratechange', onRate);

    return () => {
      cancelado = true;
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeek);
      video.removeEventListener('ratechange', onRate);
      pararSource();
      video.muted = false;
    };
  }, [videoRef, audioRef, enabled, proxyStartSec, offsetMs]);
}
