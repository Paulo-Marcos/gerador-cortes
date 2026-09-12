import type { ReactNode, RefObject } from 'react';
import { brutoUrl, type PlanoDesenhavel, type ShortSugerido } from './shortsApi';
import { MascaraEnquadramento } from './MascaraEnquadramento';
import { PalcoPrevia } from './PalcoPrevia';

interface Props {
  corteId: string;
  video: RefObject<HTMLVideoElement>;
  /** As do ARQUIVO, lidas nos metadados — mandam na proporção e na máscara. */
  dimensoes: { largura: number; altura: number };
  emQuadro: ShortSugerido | undefined;
  temPalco: boolean;
  palcoNaTela: boolean;
  planoNaTela: PlanoDesenhavel | null | undefined;
  /** O gancho e a legenda, que trocam de pai conforme o palco entra ou sai. */
  legenda: ReactNode;
  onMetadados: (dados: { largura: number; altura: number; duracao: number }) => void;
  onTempo: (segundos: number) => void;
  aoBuscar: () => void;
}

/**
 * D-459/D-500: o bruto, e ao lado dele o short como vai sair.
 *
 * São duas telas com papéis diferentes: o quadro cru serve para escolher o
 * TRECHO, e a prévia do palco para julgar o ENQUADRAMENTO. Por isso convivem
 * em vez de uma substituir a outra.
 */
export function PlayerDoBruto({
  corteId,
  video,
  dimensoes,
  emQuadro,
  temPalco,
  palcoNaTela,
  planoNaTela,
  legenda,
  onMetadados,
  onTempo,
  aoBuscar,
}: Props) {
  return (
    <div className="flex min-h-0 w-full flex-[2] items-stretch justify-center gap-3">
      <div
        className="relative max-h-full w-full overflow-hidden rounded-[10px] bg-black"
        style={{ aspectRatio: `${dimensoes.largura || 16} / ${dimensoes.altura || 9}` }}
      >
        <video
          ref={video}
          src={brutoUrl(corteId)}
          controls
          onLoadedMetadata={(e) =>
            onMetadados({
              largura: e.currentTarget.videoWidth,
              altura: e.currentTarget.videoHeight,
              duracao: e.currentTarget.duration || 0,
            })
          }
          onTimeUpdate={(e) => onTempo(e.currentTarget.currentTime)}
          // Mexer no cursor com a mão cancela a parada armada pelo
          // "Assistir" — senão um `pause` dispararia minutos depois, num
          // ponto que não tem nada a ver com o trecho que se mandou tocar.
          onSeeking={aoBuscar}
          className="absolute inset-0 h-full w-full"
        />
        {/* D-558: a máscara é o enquadramento DESENHADO, e some pelo
            mesmo motivo que o controle sumiu do modal — com palco, a
            janela 9:16 sobre o quadro cru não descreve o short que vai
            sair. Quem descreve é a prévia ao lado. Sem palco ela é a
            única prévia que existe, e continua. */}
        {emQuadro && !temPalco && (
          <MascaraEnquadramento
            largura={dimensoes.largura}
            altura={dimensoes.altura}
            focoX={emQuadro.foco_efetivo}
          >
            {legenda}
          </MascaraEnquadramento>
        )}
        {/* Com palco a legenda não perde o pai: ela vinha dentro da
            máscara e sairia de cena junto com ela. */}
        {emQuadro && temPalco && !palcoNaTela && legenda}

      </div>

      {palcoNaTela && planoNaTela && (
        <div className="flex min-h-0 flex-none flex-col items-center gap-1">
          <PalcoPrevia plano={planoNaTela} video={video}>
            {legenda}
          </PalcoPrevia>
          {/* D-562: aqui a prévia só MOSTRA. Mover e dimensionar as
              janelas passaram os dois para a seção 3 do "Definir o
              palco", onde a prévia é fixa e o controle de tamanho já
              morava — eram metades da mesma decisão em telas diferentes.
              O gesto era bom; o lugar é que estava errado. */}
          <span className="font-code text-[9.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
            como vai sair
          </span>
        </div>
      )}
    </div>
  );
}
