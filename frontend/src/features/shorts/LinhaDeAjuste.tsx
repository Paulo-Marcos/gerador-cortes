import { ChevronLeft, ChevronRight, Crop, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModelosDePalco } from './useShortsDoCorte';
import type { ShortSugerido } from './shortsApi';

// D-492: os refinos de um candidato, reunidos e recolhidos.
//
// Eles estavam soltos entre os botões de decisão, competindo pelo mesmo espaço:
// "início aqui" ao lado de "aprovar", o seletor de arranjo no meio dos números.
// São coisas de momentos diferentes — decidir é uma vez, refinar é iterativo —
// e misturá-las obriga a reler a fileira inteira a cada passada.
//
// Aqui eles ficam num bloco próprio, com fundo recuado, aberto sob demanda.

/** Quanto cada clique move o enquadramento. 5% do quadro ≈ 96px em 1920. */
const PASSO_FOCO = 0.05;

interface Props {
  short: ShortSugerido;
  ocupado: boolean;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  onFoco: (delta: number) => void;
  onModelo: (modeloId: string) => void;
  onTocar: () => void;
}

export function LinhaDeAjuste({ short, ocupado, onBorda, onFoco, onModelo }: Props) {
  const modelos = useModelosDePalco();
  const escolhido = modelos.data?.modelos.find((m) => m.id === short.modelo_palco);

  return (
    <div
      className="space-y-2.5 border-y border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-3"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Ajustes do candidato"
    >
      <Grupo rotulo="bordas" dica="Usa o instante em que o player está agora">
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onBorda('inicio_seg')}>
          início aqui
        </Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onBorda('fim_seg')}>
          fim aqui
        </Button>
      </Grupo>

      <Grupo rotulo="enquadramento" dica="Move o centro da janela 9:16 na horizontal">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mover o enquadramento para a esquerda"
          disabled={ocupado}
          onClick={() => onFoco(-PASSO_FOCO)}
        >
          <ChevronLeft />
        </Button>
        <span className="font-code text-[11.5px] tabular-nums text-[var(--wb-text-dim)]">
          <Crop size={11} className="mr-1 inline" aria-hidden />
          {Math.round(short.foco_efetivo * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mover o enquadramento para a direita"
          disabled={ocupado}
          onClick={() => onFoco(PASSO_FOCO)}
        >
          <ChevronRight />
        </Button>
      </Grupo>

      <Grupo rotulo="arranjo" dica={escolhido?.porque ?? 'Deduz o arranjo das regiões disponíveis'}>
        <Layers size={12} className="text-[var(--wb-text-mute)]" aria-hidden />
        <select
          aria-label="Arranjo do palco deste short"
          value={short.modelo_palco}
          disabled={ocupado || !modelos.data}
          onChange={(e) => onModelo(e.target.value)}
          className="h-7 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] text-[var(--wb-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          <option value="">automático</option>
          {modelos.data?.modelos.map((modelo) => (
            <option key={modelo.id} value={modelo.id}>
              {modelo.nome}
            </option>
          ))}
        </select>
      </Grupo>
    </div>
  );
}

/** Um refino, com o nome do que ele mexe à esquerda — o olho varre a coluna. */
function Grupo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" title={dica}>
      <span className="w-[104px] flex-none font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        {rotulo}
      </span>
      {children}
    </div>
  );
}
