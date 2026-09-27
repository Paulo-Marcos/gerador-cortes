import { useEffect } from 'react';

// D-450: a velocidade de trabalho vem de Ajustes (features/settings); aqui só
// se aplica um número a um <video>, venha ele de onde vier.

/**
 * Aplica uma velocidade a um <video> nativo. Chame do componente que RENDERIZA
 * o <video>: fora dele a ref ainda pode estar nula quando o efeito roda — foi
 * assim que o Editor chegou a anunciar 1,50x com o video rodando em 1,00x.
 *
 * Grava tambem `defaultPlaybackRate` porque o `playbackRate` de um elemento de
 * midia e RESETADO para o default a cada carga — e por isso que trocar de corte
 * devolvia o player para 1,00x. Passe `chaveDaMidia` (o src) para reaplicar
 * quando a fonte muda.
 */
export function useVelocidadeNoVideo(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  velocidade: number,
  chaveDaMidia?: string,
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = velocidade;
    video.playbackRate = velocidade;
  }, [videoRef, velocidade, chaveDaMidia]);
}
