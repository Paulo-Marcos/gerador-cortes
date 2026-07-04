import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  GripVertical,
  Plus,
  Scissors,
  Target,
  Trash2,
  VolumeX,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePromptDesvios } from '@/hooks/useEditor';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getManualPromptText } from '@/lib/manualPrompt';
import { hmsParaSeg, validarHms } from '../timeUtils';
import type { Desvio } from '@/types/models';

interface Props {
  corteId: string;
  desvios: Desvio[];
  selectedDesvioIdx?: number | null;
  onSeek: (seg: number) => void;
  onAdicionar: (d: Desvio) => void;
  onRemover: (idx: number) => void;
  onCriarCorteDoDesvio: (idx: number, titulo: string) => void;
  onGerarPorIa: () => void;
  onGerarManual: () => void;
  onGerarSilencios: () => void;
  pending: {
    ia?: boolean;
    silencios?: boolean;
    adicionando?: boolean;
    removendo?: boolean;
  };
}

export function TrechosPanel({
  corteId,
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionar,
  onRemover,
  onCriarCorteDoDesvio,
  onGerarPorIa,
  onGerarManual,
  onGerarSilencios,
  pending,
}: Props) {
  const promptManual = usePromptDesvios(corteId, false);
  const [adicionando, setAdicionando] = useState(false);
  const [novoInicio, setNovoInicio] = useState('00:00:00');
  const [novoFim, setNovoFim] = useState('00:00:00');
  const [novoMotivo, setNovoMotivo] = useState('');

  // Sort chronologically preserving original index for callbacks
  const sortedWithOriginalIdx = useMemo(
    () =>
      desvios
        .map((d, i) => ({ d, i }))
        .sort((a, b) => hmsParaSeg(a.d.inicio_hms) - hmsParaSeg(b.d.inicio_hms)),
    [desvios],
  );

  // Map original index → sorted position (for scroll-to)
  const origIdxToSortedPos = useMemo(() => {
    const map = new Map<number, number>();
    sortedWithOriginalIdx.forEach(({ i }, sortPos) => map.set(i, sortPos));
    return map;
  }, [sortedWithOriginalIdx]);

  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Scroll selected desvio into view when selectedDesvioIdx changes
  useEffect(() => {
    if (selectedDesvioIdx == null || selectedDesvioIdx < 0) return;
    const sortedPos = origIdxToSortedPos.get(selectedDesvioIdx);
    if (sortedPos == null) return;
    itemRefs.current[sortedPos]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDesvioIdx, origIdxToSortedPos]);

  function submitAdicionar() {
    if (!validarHms(novoInicio) || !validarHms(novoFim)) return;
    onAdicionar({ inicio_hms: novoInicio, fim_hms: novoFim, motivo: novoMotivo.trim() });
    setAdicionando(false);
    setNovoMotivo('');
  }

  async function abrirManual() {
    onGerarManual();
    const data = promptManual.data ?? (await promptManual.refetch()).data;
    const texto = getManualPromptText(data);
    if (texto) await copyTextToClipboard(texto);
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <div className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <GripVertical size={14} className="text-[var(--wb-text-dim)]" aria-hidden />
        <Scissors size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
        <span className="font-code text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Trechos a remover
        </span>
        <span className="rounded-[var(--radius-xs)] bg-[var(--wb-accent)] px-1.5 py-0.5 font-code text-[10px] font-semibold text-white">
          {desvios.length}
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-3 py-2">
        <Button size="sm" onClick={onGerarPorIa} disabled={pending.ia}>
          <Bot size={13} />
          Gerar IA
        </Button>
        <Button size="sm" variant="outline" onClick={() => void abrirManual()}>
          <WandSparkles size={13} />
          Manual
        </Button>
        <Button size="sm" variant="outline" onClick={onGerarSilencios} disabled={pending.silencios}>
          <VolumeX size={13} />
          Silencios
        </Button>
        <div className="flex-1" />
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => setAdicionando((value) => !value)}
          aria-label="Adicionar trecho"
        >
          <Plus size={13} />
        </Button>
      </div>

      {adicionando && (
        <div className="grid gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={novoInicio}
              onChange={(event) => setNovoInicio(event.target.value)}
              className="h-8 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 font-code text-xs text-[var(--wb-text)] outline-none"
            />
            <input
              value={novoFim}
              onChange={(event) => setNovoFim(event.target.value)}
              className="h-8 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 font-code text-xs text-[var(--wb-text)] outline-none"
            />
          </div>
          <input
            value={novoMotivo}
            onChange={(event) => setNovoMotivo(event.target.value)}
            placeholder="Motivo"
            className="h-8 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-xs text-[var(--wb-text)] outline-none"
          />
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAdicionando(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submitAdicionar} disabled={pending.adicionando}>
              <Plus size={13} />
              Adicionar
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-auto p-3">
        {sortedWithOriginalIdx.length === 0 ? (
          <div className="p-5 text-center text-xs text-[var(--wb-text-dim)]">
            Nenhum trecho marcado ainda.
          </div>
        ) : (
          sortedWithOriginalIdx.map(({ d: desvio, i: originalIdx }, sortedPos) => {
            const isSelected = originalIdx === selectedDesvioIdx;
            return (
              <article
                key={`${originalIdx}-${desvio.inicio_hms}`}
                ref={(el) => {
                  itemRefs.current[sortedPos] = el;
                }}
                className={`flex items-start gap-2.5 rounded-[var(--radius-sm)] border p-2.5 transition-colors ${
                  isSelected
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)]/10'
                    : 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)]'
                }`}
              >
                <span
                  className={`w-1 self-stretch rounded-full ${isSelected ? 'bg-[var(--wb-accent)]' : 'bg-error'}`}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => onSeek(hmsParaSeg(desvio.inicio_hms))}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`block font-code text-[11px] font-medium ${isSelected ? 'text-[var(--wb-accent)]' : 'text-error'}`}
                  >
                    {desvio.inicio_hms} <span className="text-[var(--wb-text-dim)]">-&gt;</span>{' '}
                    {desvio.fim_hms}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-[var(--wb-text-mute)]">
                    {desvio.motivo || 'Trecho marcado para remocao'}
                  </span>
                  <span className="mt-1 block font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
                    IA/Tecnico
                  </span>
                </button>
                <div className="grid gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onSeek(hmsParaSeg(desvio.inicio_hms))}
                    aria-label="Ir para trecho"
                  >
                    <Target size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      onCriarCorteDoDesvio(
                        originalIdx,
                        desvio.motivo || `Trecho ${originalIdx + 1}`,
                      )
                    }
                    aria-label="Criar corte"
                  >
                    <Scissors size={13} />
                  </Button>
                  <Button
                    variant="danger"
                    size="icon-sm"
                    onClick={() => onRemover(originalIdx)}
                    disabled={pending.removendo}
                    aria-label="Remover trecho"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
