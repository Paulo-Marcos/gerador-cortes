import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, GripVertical, Loader2, RefreshCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { TranscricaoLinha } from '@/types/models';

interface Props {
  linhas: TranscricaoLinha[] | undefined;
  currentTime: number;
  onSeek: (seg: number) => void;
  onAtualizar: () => void;
  atualizando: boolean;
}

export function TranscriptPanel({ linhas, currentTime, onSeek, onAtualizar, atualizando }: Props) {
  const [busca, setBusca] = useState('');

  const linhasFiltradas = useMemo(() => {
    if (!linhas) return [];
    if (!busca.trim()) return linhas;
    const query = busca.toLowerCase();
    return linhas.filter((linha) => linha.texto.toLowerCase().includes(query));
  }, [linhas, busca]);

  // Linha ativa = a primeira cujo intervalo cobre currentTime. Como linhas no
  // VTT/json3 frequentemente nao cobrem 100% do tempo, fazemos fallback: se
  // nenhuma cobre exatamente, escolhe a ultima cujo `start` <= currentTime.
  const linhaAtivaIdx = useMemo(() => {
    if (!linhas || linhas.length === 0) return -1;
    let exato = -1;
    let ultimaAtras = -1;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (currentTime >= l.start && currentTime < l.end) {
        exato = i;
        break;
      }
      if (currentTime >= l.start) ultimaAtras = i;
    }
    return exato !== -1 ? exato : ultimaAtras;
  }, [linhas, currentTime]);

  // Auto-scroll: traz a linha ativa para a viewport sempre que muda.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [linhaAtivaIdx]);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <div className="flex items-center gap-2 font-code text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          <GripVertical size={14} className="text-[var(--wb-text-dim)]" aria-hidden />
          <FileText size={14} />
          Transcricao
        </div>
        <Tooltip label="Atualizar transcricao" side="bottom">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAtualizar}
            disabled={atualizando}
          >
            {atualizando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCcw size={14} />
            )}
            Atualizar
          </Button>
        </Tooltip>
      </div>

      <div className="border-b border-[var(--wb-border-soft)] px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--wb-text-dim)]"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar palavra..."
            className="h-8 border-[var(--wb-border)] bg-[var(--wb-bg-inset)] pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!linhas && (
          <div className="p-4 text-center text-xs text-[var(--wb-text-dim)]">
            <Loader2 size={14} className="mr-1 inline animate-spin" /> Carregando...
          </div>
        )}
        {linhas && linhasFiltradas.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--wb-text-dim)]">Nenhum resultado.</div>
        )}
        {linhas && linhasFiltradas.length > 0 && (
          <ul role="list">
            {linhasFiltradas.map((linha, index) => {
              const ativa = linhaAtivaIdx !== -1 && linhas?.[linhaAtivaIdx] === linha;
              return (
                <li key={`${linha.start}-${index}`}>
                  <button
                    ref={ativa ? activeRef : undefined}
                    type="button"
                    onClick={() => onSeek(linha.start)}
                    className={cn(
                      'grid w-full grid-cols-[54px_minmax(0,1fr)] gap-3 px-3.5 py-1.5 text-left transition-colors',
                      'hover:bg-[var(--wb-bg-inset)] focus-visible:outline-none focus-visible:bg-[var(--wb-bg-inset)]',
                      ativa
                        ? 'border-l-2 border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                        : 'border-l-2 border-transparent',
                    )}
                  >
                    <span className="font-code text-[11px] text-[var(--wb-text-dim)]">
                      {fmt(linha.start)}
                    </span>
                    <span className="font-editorial text-[15px] leading-relaxed text-[var(--wb-text)]">
                      {linha.texto}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function fmt(seg: number | undefined | null): string {
  if (!Number.isFinite(seg)) return '--:--';
  const value = seg as number;
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
