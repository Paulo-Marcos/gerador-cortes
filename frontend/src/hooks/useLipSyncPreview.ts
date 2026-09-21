import { useEffect, useRef, useState, type RefObject } from 'react';

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
 * D-601: o preview não é instantâneo — decodificar o FLAC do corte inteiro leva
 * ~7s (medido: 21 min de áudio, `decodeAudioData` em 7.194ms). Sem dizer isso, a
 * espera é indistinguível de defeito: foi essa a queixa que abriu a demanda. O
 * hook passa a declarar em que pé está, para quem desenha o botão poder contar.
 */
export type EstadoLipSync = 'desligado' | 'carregando' | 'pronto' | 'erro';

/**
 * Cache de UM buffer decodificado por vez (chaveado pela URL do proxy). O FLAC
 * decodificado ocupa memória (~PCM f32); manter só o corte atual evita acúmulo
 * ao navegar entre cortes. Trocar de corte/refresh muda a URL e substitui aqui.
 *
 * D-230: entrada expira por TTL e uma promise que rejeita é evictada — sem isso,
 * uma falha de fetch/decode ficava grudada e o mesmo src nunca mais re-tentava.
 */
export const BUFFER_TTL_MS = 5 * 60 * 1000;
let bufferCache: { src: string; promise: Promise<AudioBuffer>; ts: number } | null = null;

// D-659: o TTL acima só era conferido na PRÓXIMA chamada. Quem saía do editor e
// não voltava deixava o PCM preso para sempre. Medido (21/09/2026): o proxy é
// mono, mas decodifica na taxa do contexto em float32 — ~10 MB por minuto; um
// corte de 36 min ficou com 385 MB. Agora cada editor montado segura o cache, e o
// último a sair agenda o descarte: voltar ao mesmo corte dentro do prazo
// continua instantâneo, e ninguém voltando, a memória volta.
let editoresMontados = 0;
let descarteAgendado: ReturnType<typeof setTimeout> | null = null;

export function segurarBufferDoLipSync(): void {
  editoresMontados += 1;
  if (descarteAgendado) {
    clearTimeout(descarteAgendado);
    descarteAgendado = null;
  }
}

export function soltarBufferDoLipSync(): void {
  editoresMontados = Math.max(0, editoresMontados - 1);
  if (editoresMontados > 0 || descarteAgendado) return;
  descarteAgendado = setTimeout(() => {
    descarteAgendado = null;
    if (editoresMontados === 0) bufferCache = null;
  }, BUFFER_TTL_MS);
}

/** Qual áudio está decodificado em memória agora (para teste e diagnóstico). */
export function srcDoBufferEmCache(): string | null {
  return bufferCache?.src ?? null;
}

export function carregarBuffer(ctx: AudioContext, src: string): Promise<AudioBuffer> {
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
): EstadoLipSync {
  const ctxRef = useRef<AudioContext | null>(null);
  const [estado, setEstado] = useState<EstadoLipSync>('desligado');
  // Qual src já terminou de decodificar. O efeito re-roda a CADA nudge de offset,
  // e sem isso o botão piscaria "carregando" a cada 10ms ajustados — mentindo
  // sobre uma espera que não existe mais (o buffer está em cache).
  const decodificadoRef = useRef<string | null>(null);

  // D-659: o AudioContext vivia até o fim da aba — cada editor aberto com o
  // preview deixava uma thread de áudio acordada. Fecha na saída, junto com a
  // parte deste editor na retenção do buffer.
  useEffect(() => {
    segurarBufferDoLipSync();
    return () => {
      soltarBufferDoLipSync();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== 'closed') void ctx.close();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    if (!enabled) {
      video.muted = false;
      setEstado('desligado');
      return;
    }

    const src = audio.currentSrc || audio.src;
    if (!src) {
      setEstado('erro');
      return;
    }
    setEstado(decodificadoRef.current === src ? 'pronto' : 'carregando');

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
        decodificadoRef.current = src;
        setEstado('pronto');
        if (!video.paused) iniciarSource();
      })
      .catch(() => {
        // Falha de fetch/decode: o editor segue de pé, mas o botão precisa dizer
        // que não deu — antes isso morria em silêncio e virava "não funciona".
        decodificadoRef.current = null;
        if (!cancelado) setEstado('erro');
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

  return estado;
}
