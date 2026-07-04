import { useMemo, type RefObject } from 'react';

export interface PlayerHandle {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (seg: number) => void;
  step: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
}

const MIN_RATE = 0.25;
const MAX_RATE = 4;

export function useVideoPlayer(videoRef: RefObject<HTMLVideoElement>): PlayerHandle {
  return useMemo<PlayerHandle>(
    () => ({
      play: () => void videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      togglePlay: () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
      },
      seekTo: (seg) => {
        if (videoRef.current) videoRef.current.currentTime = seg;
      },
      step: (delta) => {
        const video = videoRef.current;
        if (video) video.currentTime = Math.max(0, video.currentTime + delta);
      },
      setPlaybackRate: (rate) => {
        const video = videoRef.current;
        if (video) video.playbackRate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
      },
      getPlaybackRate: () => videoRef.current?.playbackRate ?? 1,
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      isPlaying: () => !(videoRef.current?.paused ?? true),
    }),
    [videoRef],
  );
}
