import { type FC } from "react";
import { Composition, registerRoot } from "remotion";
import { DEFAULT_YOUTUBE_BACKGROUND } from "./backgrounds";
import {
  CANVAS_H,
  CANVAS_W,
  CapaTikTok,
  type CapaTikTokProps,
} from "./capa-tiktok";

// A raiz do gerador da capa (`scripts/gen-capa-tiktok.mjs`). A composição mora
// em `capa-tiktok.tsx` desde a D-933: a prévia do modal de estilo a monta pela
// porta pública, e este arquivo chama `registerRoot` — importá-lo de lá
// registraria uma segunda raiz.

const DEFAULT_PROPS: CapaTikTokProps = {
  fundo: DEFAULT_YOUTUBE_BACKGROUND,
  etiqueta: "O JURO COMPOSTO",
  selo: "@canal",
  frameDataUri: "",
  faixas: {
    etiqueta: { x: 50, y: 288, w: 980, h: 200 },
    frame: { x: 130, y: 512, w: 819, h: 1024 },
    selo: { x: 50, y: 1560, w: 980, h: 72 },
  },
};

const CapaTikTokRoot: FC = () => (
  <Composition
    id="CapaTikTok"
    component={CapaTikTok}
    durationInFrames={1}
    fps={30}
    width={CANVAS_W}
    height={CANVAS_H}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(CapaTikTokRoot);
