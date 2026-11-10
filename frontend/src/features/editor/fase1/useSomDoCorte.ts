import { useCallback, useState } from 'react';
import type { EstadoLipSync } from '@/hooks/useLipSyncPreview';

// D-1095 (E7): a pergunta do som mora na aba Decisões, mas o preview ao vivo
// precisa do <video>, que mora no player. O estado sobe para o EditorFase1, pai
// dos dois: a pergunta liga o fone, o player toca o áudio deslocado e devolve
// em que pé o preview está (carregando, pronto, erro).

export interface SomDoCorte {
  offsetMs: number;
  mudarOffset: (ms: number) => void;
  /** Há proxy de áudio do corte para ouvir o deslocamento. */
  podeOuvir: boolean;
  ouvindo: boolean;
  estadoDoPreview: EstadoLipSync;
  alternarOuvir: () => void;
  pararDeOuvir: () => void;
  /** "Está certo": a pergunta respondida nesta visita (decisão do Paulo, 10/11/2026). */
  certo: boolean;
  marcarCerto: () => void;
}

interface EntradaDoSom {
  corteId: string;
  /** Proxy de áudio do corte e o tempo de vídeo (s) em que ele começa. */
  audioPreviewSrc?: string;
  audioPreviewStartSec?: number;
  audioOffsetMs?: number;
  onAudioOffsetChange: (ms: number) => void;
}

/** O som do corte: a pergunta 3 recebe `som`; o player, `noPlayer`. */
export function useSomDoCorte({ corteId, audioPreviewSrc, audioPreviewStartSec, audioOffsetMs = 0, onAudioOffsetChange }: EntradaDoSom) {
  const [querOuvir, setQuerOuvir] = useState(false);
  const [estadoDoPreview, setEstadoDoPreview] = useState<EstadoLipSync>('desligado');
  const alternarOuvir = useCallback(() => setQuerOuvir((v) => !v), []);
  const pararDeOuvir = useCallback(() => setQuerOuvir(false), []);
  const [certo, setCerto] = useState(false);
  // O "Está certo" vale para o som que se ouviu: qualquer passo (botão, Ctrl+,,
  // Ctrl+., desfazer) ou outro corte desmarca. Não grava nada: o offset vai no
  // Salvar, como antes. Ajuste de estado no render, sem efeito (padrão do React).
  const [visto, setVisto] = useState({ corteId, audioOffsetMs });
  if (visto.corteId !== corteId || visto.audioOffsetMs !== audioOffsetMs) {
    setVisto({ corteId, audioOffsetMs });
    setCerto(false);
  }
  // Respondido, o fone desliga e o vídeo volta a ter som.
  const marcarCerto = useCallback(() => {
    setCerto(true);
    setQuerOuvir(false);
  }, []);
  const podeOuvir = !!audioPreviewSrc;
  const ouvindo = querOuvir && podeOuvir;
  const som: SomDoCorte = {
    offsetMs: audioOffsetMs,
    mudarOffset: onAudioOffsetChange,
    podeOuvir,
    ouvindo,
    estadoDoPreview,
    alternarOuvir,
    pararDeOuvir,
    certo,
    marcarCerto,
  };
  const noPlayer = {
    audioPreviewSrc,
    audioPreviewStartSec,
    audioOffsetMs,
    ouvirSincronia: ouvindo,
    onEstadoDaSincronia: setEstadoDoPreview,
  };
  return { som, noPlayer };
}
