import { useState } from 'react';
import { Anel, type CorDoAnel } from '@/components/ui/anel';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Miniatura } from '@/components/ui/miniatura';
import { lerNotaDoCorte, NOTA_MAXIMA } from '@/features/porque-do-corte/notaDoCorte';
import type { TomDoSelo } from '@/upgrade/SeloDeEstado';

// D-1149 (E-069 H-16) · As células da linha do corte que não decidem nada: o número com a
// ordem, a capa e a nota. A linha (`CorteLinhaAp`) junta e liga.

/**
 * O número e a ordem. Reordenar fica antes da capa: é a única ação que muda a LISTA e não o
 * corte, e misturá-la com as outras à direita confundia os dois gestos (D-599).
 */
export function OrdemDaLinha({
  numero,
  podeSubir,
  podeDescer,
  reordenando,
  onMover,
}: {
  numero: number;
  podeSubir: boolean;
  podeDescer: boolean;
  reordenando: boolean;
  onMover: (delta: -1 | 1) => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="num w-6 text-right text-pequeno text-fg-3">{numero}</span>
      <span className="flex flex-col">
        <IconButton
          variant="fantasma"
          size="pq"
          onClick={() => onMover(-1)}
          disabled={!podeSubir || reordenando}
          aria-label={`Mover corte ${numero} para cima`}
          className="h-6"
        >
          <Icon name="chevron-up" />
        </IconButton>
        <IconButton
          variant="fantasma"
          size="pq"
          onClick={() => onMover(1)}
          disabled={!podeDescer || reordenando}
          aria-label={`Mover corte ${numero} para baixo`}
          className="h-6"
        >
          <Icon name="chevron-down" />
        </IconButton>
      </span>
    </span>
  );
}

/**
 * A capa abre o corte no editor. Sem capa, o desenho vazio da `Miniatura`. A limpeza de mídia
 * apaga a capa do disco: a imagem que não carrega também cai no desenho vazio, em vez do
 * ícone de imagem quebrada (D-878). O `error` da `<img>` chega ao invólucro pelo React.
 */
export function CapaDaLinha({
  numero,
  src,
  riscada,
  onAbrir,
}: {
  numero: number;
  src: string | undefined;
  riscada: boolean;
  onAbrir: () => void;
}) {
  const visivel = useCapaQueCarrega(src);
  return (
    <button
      type="button"
      data-sala=""
      onClick={onAbrir}
      aria-label={`Abrir o corte ${numero} no editor`}
      className="block w-full rounded-[10px] p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <Miniatura src={visivel.src} onError={visivel.aoFalhar} riscada={riscada} />
    </button>
  );
}

/** A capa que não carregou some (fica o desenho vazio); trocar de capa (`?v=` novo) tenta de novo. */
export function useCapaQueCarrega(src: string | undefined) {
  const [quebrada, setQuebrada] = useState<string>();
  return { src: src && src !== quebrada ? src : undefined, aoFalhar: () => setQuebrada(src) };
}

const COR_DA_NOTA: Partial<Record<TomDoSelo, CorDoAnel>> = { ok: 'ok', info: 'info', aviso: 'aviso' };

/**
 * D-886: a nota que a IA deu ao corte, agora num anel (DIRECAO §7.2: "Nota em anel"). É
 * botão: abre o porquê, como a tecla W. Sem nota, nada — um anel vazio pareceria nota zero.
 */
export function NotaDaLinha({ score, onAbrir }: { score: Record<string, number> | undefined; onAbrir: () => void }) {
  const nota = lerNotaDoCorte(score);
  if (!nota) return null;
  const rotulo = `Nota da IA ${nota.texto}. Ver por que a IA escolheu este corte`;
  return (
    <button
      type="button"
      data-sala=""
      onClick={onAbrir}
      title={rotulo}
      aria-label={rotulo}
      className="inline-flex rounded-pilula p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <Anel
        valor={(nota.total / NOTA_MAXIMA) * 100}
        rotulo={`Nota da IA: ${nota.total} de ${NOTA_MAXIMA}`}
        cor={COR_DA_NOTA[nota.tom] ?? 'iris'}
        tamanho={34}
        espessura={3}
      >
        <span className="num text-micro">{nota.total}</span>
      </Anel>
    </button>
  );
}
