import { interpolate, spring } from "remotion";

interface UseFadesArgs {
  frameLocal: number;
  fps: number;
  duracao: number;
  /** Frames para a entrada terminar de revelar. Default 16. */
  entryFrames?: number;
  /** Frames antes do fim em que começa o fade-out. Default 12. */
  exitWindow?: number;
}

/**
 * Animação editorial: fade + reveal sutil + leve translateY.
 * Substitui os springs/slides agressivos do layout antigo por algo mais
 * editorial — apropriado para a nova identidade com molduras.
 */
export function useFades({
  frameLocal,
  fps,
  duracao,
  entryFrames = 16,
  exitWindow = 12,
}: UseFadesArgs) {
  const enter = spring({
    frame: frameLocal,
    fps,
    config: { damping: 200, stiffness: 60, mass: 0.6 },
    durationInFrames: entryFrames,
  });
  const exit = spring({
    frame: frameLocal - (duracao - exitWindow),
    fps,
    config: { damping: 200, stiffness: 80, mass: 0.5 },
    durationInFrames: exitWindow,
  });

  const opacity = interpolate(enter, [0, 1], [0, 1]) * interpolate(exit, [0, 1], [1, 0]);
  const translateY = interpolate(enter, [0, 1], [14, 0]);
  const reveal = enter; // 0..1 para clip-path / scaleX

  return { enter, exit, opacity, translateY, reveal };
}
