import type { RefObject } from 'react';
import { ShortsDesteCorte } from '@/features/shorts/ShortsDesteCorte';
import type { Corte } from '@/types/models';
import { BoletimTecnicoPainel } from './BoletimTecnicoCard';

/** O que acompanha o checklist da Revisão: os shorts do corte Fire e o boletim do vídeo. */
export function ApoioDaRevisao({
  corte,
  videoPronto,
  player,
}: {
  corte: Pick<Corte, 'id' | 'is_fire'>;
  videoPronto: boolean;
  player: RefObject<HTMLVideoElement | null>;
}) {
  return (
    <>
      {corte.is_fire ? <ShortsDesteCorte corteId={corte.id} /> : null}
      {videoPronto && <BoletimTecnicoPainel key={corte.id} corteId={corte.id} player={player} />}
    </>
  );
}
