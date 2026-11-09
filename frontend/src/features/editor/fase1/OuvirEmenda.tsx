import type { RefObject } from 'react';
import { Icon } from '@/upgrade/Icon';
import { segParaMmSs } from '../timeUtils';
import type { AvisoDoTrecho } from './avisoDoTrecho';
import { MARGEM_DA_EMENDA_SEG, ouvirEmenda } from './escutaDaEmenda';

// D-1091: a linha do aviso "SAI" com o ponto da emenda e o botão que a toca.
// O aviso fica sobre o vídeo, que não captura clique (`pointer-events: none`):
// só esta linha volta a receber o clique.

interface Props {
  aviso: AvisoDoTrecho;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export function OuvirEmenda({ aviso, videoRef }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
      <span className="chip" style={{ background: 'var(--panel)', fontFamily: 'var(--mono)' }}>
        emenda em {segParaMmSs(aviso.emenda)}
      </span>
      <button
        type="button"
        className="btn btn-sm"
        title={`Toca ${MARGEM_DA_EMENDA_SEG} s antes do trecho, pula o que sai e toca ${MARGEM_DA_EMENDA_SEG} s depois`}
        onClick={() => {
          if (videoRef.current) ouvirEmenda(videoRef.current, aviso);
        }}
      >
        <Icon name="volume-2" />
        Ouvir a emenda
      </button>
    </div>
  );
}
