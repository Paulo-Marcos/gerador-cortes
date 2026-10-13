import { AbsoluteFill, Video } from 'remotion';
import type { YoutubePlaca, YoutubeSharedRect } from '@/shared/palco/youtubeLayout';
import {
  CabecalhoDoCanal,
  FundoLimpo,
  JanelaLimpa,
  PlacaLimpa,
  posicaoDaPlacaDe,
  posicaoDoCabecalho,
  RAIO_DA_FACECAM,
  RAIO_DA_TELA,
  type ComponentesDoPalco,
} from '@/shared/palco/palcoLimpo';

// D-911: o palco limpo na prévia do editor — as mesmas camadas do `PalcoLimpo`
// do renderer: fundo chapado, janelas arredondadas com sombra, cabeçalho do
// canal e placa em texto. Saiu do `SharedVideoLayout` para a função ficar no
// tamanho da catraca; a geometria (crop/slot) é a mesma do palco atual.

export interface ConfigCompartilhada {
  telas: 1 | 2;
  crop_facecam: YoutubeSharedRect;
  crop_tela: YoutubeSharedRect;
  slot_facecam: YoutubeSharedRect;
  slot_tela: YoutubeSharedRect;
}

export function renderedSize(crop: YoutubeSharedRect, slot: YoutubeSharedRect) {
  const scale = Math.min(slot.w / crop.w, slot.h / crop.h);
  return { w: crop.w * scale, h: crop.h * scale };
}

export function PalcoLimpoCompartilhado({
  videoSrc,
  config,
  placa,
  palco,
}: {
  videoSrc: string;
  config: ConfigCompartilhada;
  placa?: YoutubePlaca;
  palco: ComponentesDoPalco;
}) {
  const tela = renderedSize(config.crop_tela, config.slot_tela);
  const face = renderedSize(config.crop_facecam, config.slot_facecam);
  const temPlaca = palco.placa.ativo && Boolean(placa && (placa.nome || placa.papel));
  const janelaTela = { x: config.slot_tela.x, y: config.slot_tela.y, w: tela.w, h: tela.h };
  const posicaoPlaca = posicaoDaPlacaDe(palco, janelaTela);

  return (
    <AbsoluteFill>
      <FundoLimpo fundo={palco.fundo} />
      <JanelaLimpa janela={janelaTela} raio={RAIO_DA_TELA}>
        <CropVideo videoSrc={videoSrc} crop={config.crop_tela} slot={config.slot_tela} muted={false} />
      </JanelaLimpa>
      {config.telas !== 1 ? (
        <JanelaLimpa
          janela={{ x: config.slot_facecam.x, y: config.slot_facecam.y, w: face.w, h: face.h }}
          raio={RAIO_DA_FACECAM}
        >
          <CropVideo videoSrc={videoSrc} crop={config.crop_facecam} slot={config.slot_facecam} muted />
        </JanelaLimpa>
      ) : null}
      {palco.cabecalho.ativo ? (
        <CabecalhoDoCanal
          {...posicaoDoCabecalho(palco)}
          escala={palco.cabecalho.escala}
          nome={palco.cabecalho.nome}
          handle={palco.cabecalho.handle}
          imagemSrc={palco.cabecalho.imagemUrl || undefined}
        />
      ) : null}
      {temPlaca && placa ? (
        <PlacaLimpa
          x={posicaoPlaca.x}
          y={posicaoPlaca.y}
          nome={placa.nome}
          papel={placa.papel}
          sobreVideo={posicaoPlaca.dentroDaTela}
          escala={palco.placa.escala}
        />
      ) : null}
    </AbsoluteFill>
  );
}

// Renderiza só o vídeo deslocado/escalado para o recorte preencher a moldura
// (quem envolve faz o posicionamento + clip). maxWidth/maxHeight:none
// impede o preflight do Tailwind de espremer o frame dentro do slot.
export function CropVideo({
  videoSrc,
  crop,
  slot,
  muted,
}: {
  videoSrc: string;
  crop: YoutubeSharedRect;
  slot: YoutubeSharedRect;
  muted: boolean;
}) {
  const scale = Math.min(slot.w / crop.w, slot.h / crop.h);

  return (
    <Video
      src={videoSrc}
      muted={muted}
      style={{
        position: 'absolute',
        left: -crop.x * scale,
        top: -crop.y * scale,
        width: 1920 * scale,
        height: 1080 * scale,
        maxWidth: 'none',
        maxHeight: 'none',
        objectFit: 'fill',
      }}
    />
  );
}
