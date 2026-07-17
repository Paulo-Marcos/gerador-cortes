import { type FC } from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import {
  DEFAULT_YOUTUBE_BACKGROUND,
  YoutubeBackground,
  type YoutubeBackgroundId,
} from "./backgrounds";

/**
 * Entry dedicado para rasterizar os fundos editoriais em PNG via
 * `remotion still`. Não toca no Root.tsx principal — bundle isolado e rápido.
 * Uso: gerado por scripts/gen-youtube-bg.mjs.
 */
const YoutubeBgStill: FC<{ fundo: YoutubeBackgroundId }> = ({ fundo }) => (
  <AbsoluteFill>
    <YoutubeBackground fundo={fundo} />
  </AbsoluteFill>
);

const YoutubeBgRoot: FC = () => (
  <Composition
    id="YoutubeBg"
    component={YoutubeBgStill}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ fundo: DEFAULT_YOUTUBE_BACKGROUND }}
  />
);

registerRoot(YoutubeBgRoot);
