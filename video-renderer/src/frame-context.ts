import { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';

export const FrameOffsetContext = createContext(0);

/**
 * Retorna o frame GLOBAL do vídeo completo (não apenas do segmento atual).
 * Em SmartRender, useCurrentFrame() retorna 0-N (frame local do segmento),
 * mas as cenas calculam animações usando frame global.
 */
export const useGlobalFrame = (): number => {
  const offset = useContext(FrameOffsetContext);
  return useCurrentFrame() + offset;
};
