import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { segParaMmSs } from '../timeUtils';
import type { ArranjoBlocos, BlocoArranjo } from '@/types/models';
import { Icon } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────
// D-576 — a fila de blocos do corte.
//
// A pergunta que este painel responde é "em que ORDEM isso toca?", e não
// "o que sai?" (essa é a aba Trechos, que trata dos desvios). Manter as duas
// separadas é o que impede o editor de confundir remover com mover — e é a
// mesma separação que existe no backend: desvio decide o conteúdo, arranjo
// decide a sequência.
//
// Arrastar NÃO é o único caminho (WCAG 2.5.7 "Dragging Movements", nível AA):
// cada bloco tem setas ↑↓ que fazem o mesmo trabalho com um clique único. Um
// editor com mouse impreciso, trackpad ruim ou tela sensível ao toque não pode
// ficar sem a funcionalidade só porque o gesto bonito é o arrasto.
// ─────────────────────────────────────────────────────────────

interface Props {
  arranjo?: ArranjoBlocos;
  /** Ponteiro do player, em segundos ABSOLUTOS da live — onde a lâmina cai. */
  pontoSeg: number;
  onSeek: (seg: number) => void;
  onDividir: (pontoSeg: number) => void;
  onMover: (de: number, para: number) => void;
  onFundir: (indice: number) => void;
  onRestaurar: () => void;
  pendente?: boolean;
}

const ROTULOS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Identidade estável do bloco: de onde ele vem na live, não onde está na fila. */
function rotuloDeOrigem(bloco: BlocoArranjo, blocos: BlocoArranjo[]): string {
  const ordemNaLive = [...blocos]
    .sort((a, b) => a.inicio_seg - b.inicio_seg)
    .findIndex((b) => b.inicio_seg === bloco.inicio_seg);
  return ROTULOS[ordemNaLive] ?? String(ordemNaLive + 1);
}

export function BlocosPanel({
  arranjo,
  pontoSeg,
  onSeek,
  onDividir,
  onMover,
  onFundir,
  onRestaurar,
  pendente = false,
}: Props) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const blocos = arranjo?.blocos ?? [];
  const cronologico = arranjo?.cronologico ?? true;
  const podeDividir = blocos.some(
    (b) => pontoSeg > b.inicio_seg + 0.1 && pontoSeg < b.fim_seg - 0.1,
  );

  function soltar(destino: number) {
    if (arrastando !== null && arrastando !== destino) onMover(arrastando, destino);
    setArrastando(null);
    setAlvo(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-fio px-3 py-2">
        <Tooltip
          label={
            podeDividir
              ? `Dividir em ${segParaMmSs(pontoSeg)} — cria a junta por onde o bloco se move`
              : 'Leve o ponteiro para dentro de um bloco (longe das bordas) para dividir'
          }
          side="bottom"
        >
          <span>
            <Button
              type="button"
              variant="secundario"
              size="pq"
              onClick={() => onDividir(pontoSeg)}
              disabled={!podeDividir || pendente}
            >
              <Icon name="scissors" /> Dividir aqui
            </Button>
          </span>
        </Tooltip>
        <div className="flex-1" />
        {!cronologico && (
          <Tooltip label="Volta à ordem em que foi falado na live" side="bottom">
            <span>
              <Button
                type="button"
                variant="fantasma"
                size="pq"
                onClick={onRestaurar}
                disabled={pendente}
              >
                <Icon name="rotate-ccw" /> Ordem da live
              </Button>
            </span>
          </Tooltip>
        )}
        {pendente && <Icon name="loader-2" className="animate-spin text-fg-3" />}
      </div>

      {arranjo?.bruto_desatualizado && (
        // Não apagamos o bruto: o contrato desta casa é avisar, não destruir.
        <p className="flex-shrink-0 bg-aviso/[.13] px-3 py-1.5 text-micro text-aviso">
          A ordem mudou — o bruto gerado ainda está na ordem antiga. Gere de novo para ver.
        </p>
      )}

      <ol className="min-h-0 flex-1 overflow-y-auto p-2">
        {blocos.map((bloco, indice) => {
          const ultimoDaLive = !blocos.some(
            (outro) => Math.abs(outro.inicio_seg - bloco.fim_seg) < 0.05,
          );
          return (
            <li
              key={`${bloco.inicio_seg}-${bloco.fim_seg}`}
              draggable={!pendente}
              onDragStart={() => setArrastando(indice)}
              onDragOver={(e) => {
                e.preventDefault();
                setAlvo(indice);
              }}
              onDrop={() => soltar(indice)}
              onDragEnd={() => {
                setArrastando(null);
                setAlvo(null);
              }}
              className={cn(
                'mb-1 flex items-center gap-2 rounded-[6px] border px-2 py-1.5 transition-colors',
                alvo === indice && arrastando !== indice
                  ? 'border-iris bg-poco'
                  : 'border-fio',
                arrastando === indice && 'opacity-50',
              )}
            >
              <Icon name="grip-vertical" className="flex-shrink-0 cursor-grab text-fg-3" />
              <span className="flex-shrink-0 rounded-[5px] bg-poco px-1.5 py-px font-mono text-micro font-bold text-fg-2">
                {rotuloDeOrigem(bloco, blocos)}
              </span>

              <button
                type="button"
                onClick={() => onSeek(bloco.inicio_seg)}
                className="flex-1 text-left"
                title="Ir para o começo deste bloco"
              >
                <span className="font-mono text-micro text-fg">
                  {segParaMmSs(bloco.inicio_seg)} – {segParaMmSs(bloco.fim_seg)}
                </span>
                <span className="ml-2 text-micro text-fg-2">
                  {segParaMmSs(bloco.duracao_liquida_seg)}
                  {bloco.duracao_liquida_seg < bloco.duracao_seg - 0.5 && (
                    <span className="ml-1 text-fg-3">
                      (de {segParaMmSs(bloco.duracao_seg)})
                    </span>
                  )}
                </span>
              </button>

              {/* WCAG 2.5.7: o mesmo movimento sem precisar arrastar. */}
              <IconButton
                type="button"
                variant="fantasma"
                size="pq"
                aria-label="Mover para cima"
                disabled={indice === 0 || pendente}
                onClick={() => onMover(indice, indice - 1)}
              >
                <Icon name="arrow-up" />
              </IconButton>
              <IconButton
                type="button"
                variant="fantasma"
                size="pq"
                aria-label="Mover para baixo"
                disabled={indice === blocos.length - 1 || pendente}
                onClick={() => onMover(indice, indice + 1)}
              >
                <Icon name="arrow-down" />
              </IconButton>
              <Tooltip label="Juntar com o bloco seguinte na live (desfaz a divisão)" side="left">
                <span>
                  <IconButton
                    type="button"
                    variant="fantasma"
                    size="pq"
                    aria-label="Juntar com o bloco seguinte na live"
                    disabled={ultimoDaLive || pendente}
                    onClick={() => onFundir(indice)}
                  >
                    <Icon name="merge" />
                  </IconButton>
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ol>

      {blocos.length <= 1 && (
        <p className="flex-shrink-0 border-t border-fio px-3 py-2 text-micro leading-relaxed text-fg-2">
          O corte é um bloco só, na ordem da live. Leve o ponteiro até onde o assunto vira e clique{' '}
          <strong className="font-semibold">Dividir aqui</strong> — depois é só arrastar (ou usar as
          setas) para trocar a ordem.
        </p>
      )}
    </div>
  );
}
