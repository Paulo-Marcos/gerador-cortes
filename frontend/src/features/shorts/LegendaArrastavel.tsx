import type { LugarDaLegenda } from './previaLegenda';
import { LegendaDoCanal } from './LegendaPrevia';
import type { AtualizarShortBody, PalavraTranscrita, ShortSugerido } from './shortsApi';

// D-921: a legenda arrastável da prévia do modal do palco do short. Saiu do
// `DefinirPalcoModal` para ele caber na catraca com o painel do palco do canal;
// o comportamento é o mesmo de antes (D-605).

export function LegendaArrastavel({
  palavras,
  short,
  tempoAtualSeg,
  lugar,
  movendo,
  onArrastando,
  onAplicar,
}: {
  palavras: PalavraTranscrita[];
  short: ShortSugerido;
  tempoAtualSeg: number;
  lugar: LugarDaLegenda;
  movendo: boolean;
  onArrastando: (lugar: LugarDaLegenda | null) => void;
  onAplicar: (mudanca: AtualizarShortBody) => void;
}) {
  return (
    <LegendaDoCanal
      palavras={palavras}
      inicioSeg={short.inicio_seg}
      fimSeg={short.fim_seg}
      tempoAtualSeg={tempoAtualSeg}
      cor={short.legenda_cor}
      fonte={short.legenda_fonte}
      segmentos={short.segmentos}
      lugar={lugar}
      // D-605: um gesto por vez. O editor de palco e a legenda
      // arrastam no MESMO quadro, e com os dois ativos a caixa da
      // legenda roubaria o ponteiro de quem está movendo um bloco
      // — sem nada na tela explicando por que o bloco não anda.
      onMover={movendo ? undefined : onArrastando}
      // O gesto grava os TRÊS campos, inclusive a largura: uma
      // caixa que anda sem levar o próprio tamanho voltaria a
      // herdá-lo na primeira troca de palco, e o operador veria a
      // legenda que ele posicionou mudar de forma sozinha.
      onSoltar={(lugar) => {
        onArrastando(null);
        onAplicar({
          legenda_x: lugar.x,
          legenda_y: lugar.y,
          legenda_largura: lugar.largura,
        });
      }}
    />
  );
}
