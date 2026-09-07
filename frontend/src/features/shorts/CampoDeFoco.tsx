import { useState } from 'react';
import { ChevronLeft, ChevronRight, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';

// D-496: o enquadramento como valor digitável, não só as setas.
//
// As setas servem para tatear (empurra e olha); o campo serve para repetir um
// valor que já se conhece — "essa live sempre fica em 62%". Um exige o outro:
// só setas obriga a contar cliques, só campo obriga a adivinhar o número antes
// de ver.
//
// D-542: saiu do painel do candidato e veio para o modal do palco, onde tem a
// prévia ao lado. Empurrar a janela 9:16 sem ver o resultado era metade do
// trabalho — e era o que o painel oferecia.

/** Quanto cada clique move o enquadramento. 5% do quadro ≈ 96px em 1920. */
export const PASSO_FOCO = 0.05;

interface Props {
  /** Fração de 0 a 1 — o que o backend guarda. A porcentagem é só a roupa. */
  valor: number;
  ocupado: boolean;
  onAplicar: (fracao: number) => void;
}

export function ControlesDeFoco({ valor, ocupado, onAplicar }: Props) {
  const mover = (delta: number) => onAplicar(Math.min(1, Math.max(0, valor + delta)));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Mover o enquadramento para a esquerda"
        disabled={ocupado}
        onClick={() => mover(-PASSO_FOCO)}
      >
        <ChevronLeft />
      </Button>
      <CampoDeFoco valor={valor} ocupado={ocupado} onAplicar={onAplicar} />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Mover o enquadramento para a direita"
        disabled={ocupado}
        onClick={() => mover(PASSO_FOCO)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function CampoDeFoco({ valor, ocupado, onAplicar }: Props) {
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const porcento = Math.round(valor * 100);

  const confirmar = () => {
    setEditando(false);
    const numero = Number(texto.trim().replace(',', '.').replace('%', ''));
    // Texto que não é número mantém o valor anterior. `Number('')` é 0, e um
    // campo que zera sozinho joga o enquadramento para a borda esquerda.
    if (!Number.isFinite(numero) || texto.trim() === '') return;
    onAplicar(Math.min(1, Math.max(0, numero / 100)));
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Crop size={11} className="text-[var(--wb-text-mute)]" aria-hidden />
      <input
        value={editando ? texto : String(porcento)}
        disabled={ocupado}
        aria-label="Centro do enquadramento, em porcentagem"
        onFocus={() => {
          setTexto(String(porcento));
          setEditando(true);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setEditando(false);
            e.currentTarget.blur();
          }
        }}
        className="h-7 w-[52px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1.5 text-center font-code text-[11.5px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
      />
      <span className="font-code text-[10px] text-[var(--wb-text-mute)]">%</span>
    </span>
  );
}
