import { ChevronFirst, ChevronLast, SkipBack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mmss } from './linhaDoTempoShort';

// D-539: os três lugares para onde sempre se quer voltar.
//
// O player é o bruto inteiro, e a régua de um corte longo tem dez minutos. Para
// reouvir o começo de um trecho o operador estava arrastando a alça do player
// no olho — num pixel que vale meio segundo — e errando. E para o início do
// CORTE não havia nada: dava para chegar lá arrastando até o batente, o que é
// um gesto, não um controle.
//
// Os três destinos são endereços fixos que a tela já conhece. Oferecê-los como
// botão é trocar mira por clique.

interface Props {
  /** O trecho em foco. Sem candidato selecionado só sobra o início do corte. */
  trecho: { inicio_seg: number; fim_seg: number } | null;
  onIrPara: (segundos: number) => void;
}

export function NavegacaoDoPlayer({ trecho, onIrPara }: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Ir para um ponto do vídeo"
    >
      <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        ir para
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onIrPara(0)}
        title="Volta ao primeiro quadro do corte"
      >
        <SkipBack />
        início do corte
      </Button>

      {trecho && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIrPara(trecho.inicio_seg)}
            title="Põe o cursor exatamente na borda de início do trecho"
          >
            <ChevronFirst />
            início · {mmss(trecho.inicio_seg)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIrPara(trecho.fim_seg)}
            title="Põe o cursor exatamente na borda de fim do trecho"
          >
            <ChevronLast />
            fim · {mmss(trecho.fim_seg)}
          </Button>
        </>
      )}
    </div>
  );
}
