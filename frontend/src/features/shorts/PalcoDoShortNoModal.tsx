import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PalcoDoTipoNoModal } from '@/features/channels/PalcoDoTipoNoModal';
import { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { useCorte } from '@/features/editor/useCortes';

// D-923: o palco do SHORT deste corte, no modal do palco do short. Como o resto
// deste modal, a mudança vale na hora: grava sozinha no corte (com uma folga
// para não gravar a cada tecla). O canal não muda daqui; "Voltar ao do canal"
// esquece o que o corte ajustou.

const FOLGA_MS = 700;

/** O palco do short do corte em rascunho, enquanto o modal está aberto. */
export function usePalcoDoShort(corteId: string, aberto: boolean) {
  const projetoId = useCorte(corteId).data?.projeto_id;
  const palco = usePalcoDoModal({ tipo: 'short', projetoId, corteId, alvo: 'corte', aberto });
  return {
    ...palco,
    /** Aplicar um preset traz também o palco que ele leva (o preset antigo não muda nada). */
    comPalcoDoPreset: <T,>(payload: T): T => {
      palco.dePreset((payload as { palco?: unknown }).palco);
      return payload;
    },
  };
}

export type PalcoDoShort = ReturnType<typeof usePalcoDoShort>;

/** D-960: o palco do modal — o do preset em edição, ou o do corte (que grava sozinho). */
export function usePalcoNoModal(corteId: string, aberto: boolean, doPreset?: PalcoDoShort): PalcoDoShort {
  const doCorte = usePalcoDoShort(corteId, aberto && !doPreset);
  return doPreset ?? doCorte;
}

export const tituloDoPalco = (estilo: 'atual' | 'limpo') =>
  `Palco do short · estilo ${estilo === 'limpo' ? 'Limpo' : 'Atual'}`;

/**
 * D-960: no preset (`emPreset`) nada grava no corte: o palco vai junto quando o
 * preset é salvo, e o rodapé do corte não se aplica.
 */
export function PalcoDoShortNoModal({ palco, emPreset = false }: { palco: ReturnType<typeof usePalcoDoModal>; emPreset?: boolean }) {
  const { mudou, aplicar, rascunho } = palco;
  useEffect(() => {
    if (!mudou || emPreset) return;
    const id = window.setTimeout(() => aplicar(), FOLGA_MS);
    return () => window.clearTimeout(id);
    // `aplicar` muda a cada render; o gatilho é o rascunho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho, mudou, emPreset]);

  if (!palco.rascunho || !palco.efetivo) return null;
  return (
    <div className="grid gap-2">
      <PalcoDoTipoNoModal tipo="short" rascunho={palco.rascunho} efetivo={palco.efetivo} onMudar={palco.mudar} />
      {emPreset ? (
        <p className="text-[11.5px] text-[var(--wb-text-mute)]">Vai junto no preset: aplicá-lo traz este palco.</p>
      ) : (
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--wb-text-mute)]">
        <span>{palco.salvando ? 'Salvando no corte…' : 'Vale só para os shorts deste corte.'}</span>
        {palco.origem === 'corte' && (
          <Button type="button" variant="ghost" size="sm" onClick={palco.herdar} disabled={palco.salvando}>
            Desfazer os ajustes deste corte
          </Button>
        )}
      </div>
      )}
    </div>
  );
}
