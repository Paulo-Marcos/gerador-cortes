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

export const tituloDoPalco = (estilo: 'atual' | 'limpo') =>
  `Palco do short · estilo ${estilo === 'limpo' ? 'Limpo' : 'Atual'}`;

export function PalcoDoShortNoModal({ palco }: { palco: ReturnType<typeof usePalcoDoModal> }) {
  const { mudou, aplicar, rascunho } = palco;
  useEffect(() => {
    if (!mudou) return;
    const id = window.setTimeout(() => aplicar(), FOLGA_MS);
    return () => window.clearTimeout(id);
    // `aplicar` muda a cada render; o gatilho é o rascunho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho, mudou]);

  if (!palco.rascunho || !palco.efetivo) return null;
  return (
    <div className="grid gap-2">
      <PalcoDoTipoNoModal tipo="short" rascunho={palco.rascunho} efetivo={palco.efetivo} onMudar={palco.mudar} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--wb-text-mute)]">
        <span>{palco.salvando ? 'Salvando no corte…' : 'Vale só para os shorts deste corte.'}</span>
        {palco.origem === 'corte' && (
          <Button type="button" variant="ghost" size="sm" onClick={palco.herdar} disabled={palco.salvando}>
            Desfazer os ajustes deste corte
          </Button>
        )}
      </div>
    </div>
  );
}
