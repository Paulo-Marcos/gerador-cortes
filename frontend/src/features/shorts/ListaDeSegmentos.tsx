import { ArrowDown, ArrowUp, Scissors, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { janelaNova, mmss } from './linhaDoTempoShort';
import {
  comBordaDoSegmento,
  comSegmentoMovido,
  comSegmentoNovo,
  duracaoDe,
  duracaoLiquida,
  efetivos,
  MAX_SEGMENTOS,
  semOSegmento,
  type Segmento,
} from './segmentosDoShort';
import type { ShortSugerido } from './shortsApi';

// D-604: os segmentos do bruto que este short toca, listados na ordem de toque.
//
// Um short era uma janela única. O operador pediu para montar UM short com
// pedaços descontínuos — "de 0 a 30s e depois de 45 a 60s" —, porque o meio não
// serve e cortar fora é exatamente o trabalho.
//
// Duas decisões desta tela, e o porquê de cada uma:
//
// A ORDEM É DELE. As setas movem o segmento na ordem de TOQUE, não na do relógio.
// Abrir com o gancho mais forte mesmo que ele venha depois na live é técnica
// corrente de short, e uma lista que se reordena sozinha desfaria a escolha sem
// avisar. Por isso a coluna mostra o número da ORDEM e, ao lado, o tempo no
// bruto — quando os dois discordam, é porque ele quis.
//
// REMOVER O PENÚLTIMO DESFAZ A COLAGEM. Sobrando um segmento só, o backend o
// colapsa na janela única com as bordas DELE — e não com o envelope antigo, que
// ainda cobriria o buraco que o operador tinha tirado fora.

interface Props {
  short: ShortSugerido;
  /** Onde o player está, na timeline do bruto — de onde nasce o segmento novo. */
  tempoAtualSeg: number;
  /** A duração do bruto, para o segmento novo não passar do fim. */
  duracaoBrutoSeg: number;
  ocupado: boolean;
  onGravar: (segmentos: Segmento[]) => void;
  /** Leva o player até um instante do bruto — clicar no segmento vai até ele. */
  onIr: (segundos: number) => void;
}

export function ListaDeSegmentos({
  short,
  tempoAtualSeg,
  duracaoBrutoSeg,
  ocupado,
  onGravar,
  onIr,
}: Props) {
  const segmentos = efetivos(short);
  const colado = (short.segmentos?.length ?? 0) > 1;
  const cheio = segmentos.length >= MAX_SEGMENTOS;

  const adicionar = () => {
    // A MESMA janela do trecho manual (`janelaNova`): o operador parou o player
    // onde a fala começa, e o pedaço nasce ADIANTE desse ponto. Uma segunda conta
    // aqui faria o segmento novo nascer com duração diferente do trecho novo, sem
    // nada explicando a diferença.
    const janela = janelaNova(tempoAtualSeg, duracaoBrutoSeg);
    onGravar(comSegmentoNovo(short, janela.inicio, janela.fim));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-code text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          {colado
            ? `${segmentos.length} segmentos · ${Math.round(duracaoLiquida(short))}s de vídeo`
            : 'um segmento só'}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado || cheio || duracaoBrutoSeg <= 0}
          onClick={adicionar}
          title={
            cheio
              ? `${MAX_SEGMENTOS} segmentos é o limite — acima disso a colagem deixa de ser um short.`
              : 'Marca um segmento novo a partir de onde o player está.'
          }
        >
          <Scissors />
          Segmento em {mmss(tempoAtualSeg)}
        </Button>
      </div>

      <ol className="space-y-1">
        {segmentos.map((segmento, indice) => (
          <li
            key={`${segmento.inicio_seg}-${segmento.fim_seg}-${indice}`}
            className="flex items-center gap-1.5 rounded-[7px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2 py-1"
          >
            {/* O número é a ORDEM DE TOQUE, e o tempo ao lado é onde ele fica no
                bruto. Quando os dois discordam, foi escolha do operador. */}
            <span className="font-code text-[10px] font-bold text-[var(--wb-text-dim)]">
              {indice + 1}
            </span>
            <button
              type="button"
              onClick={() => onIr(segmento.inicio_seg)}
              className="flex-1 text-left font-code text-[11px] tabular-nums hover:text-[var(--wb-accent-strong)]"
              title="Ir até este segmento no player"
            >
              {mmss(segmento.inicio_seg)} → {mmss(segmento.fim_seg)}
              <span className="ml-1.5 text-[var(--wb-text-mute)]">
                {Math.round(duracaoDe(segmento))}s
              </span>
            </button>
            {/* D-608: o ajuste fino DESTE segmento, pelo instante do player — o
                mesmo "início aqui / fim aqui" que o trecho comum tem. A alça da
                régua resolve o grosso; isto é para acertar o quadro, que é onde
                um pixel de régua vale meio segundo. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() =>
                onGravar(
                  comBordaDoSegmento(short, indice, 'inicio', tempoAtualSeg, duracaoBrutoSeg),
                )
              }
              title={`Começar o segmento ${indice + 1} em ${mmss(tempoAtualSeg)}`}
              aria-label={`Começar o segmento ${indice + 1} onde o player está`}
            >
              [
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() =>
                onGravar(comBordaDoSegmento(short, indice, 'fim', tempoAtualSeg, duracaoBrutoSeg))
              }
              title={`Terminar o segmento ${indice + 1} em ${mmss(tempoAtualSeg)}`}
              aria-label={`Terminar o segmento ${indice + 1} onde o player está`}
            >
              ]
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado || indice === 0}
              onClick={() => onGravar(comSegmentoMovido(short, indice, -1))}
              aria-label={`Tocar o segmento ${indice + 1} mais cedo`}
            >
              <ArrowUp size={12} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado || indice === segmentos.length - 1}
              onClick={() => onGravar(comSegmentoMovido(short, indice, 1))}
              aria-label={`Tocar o segmento ${indice + 1} mais tarde`}
            >
              <ArrowDown size={12} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              // Um segmento só NÃO é colagem: não há o que remover, e o botão
              // existir sugeriria que dá para deixar o short sem vídeo nenhum.
              disabled={ocupado || segmentos.length <= 1}
              onClick={() => onGravar(semOSegmento(short, indice))}
              aria-label={`Tirar o segmento ${indice + 1}`}
              className={cn(segmentos.length <= 1 && 'invisible')}
            >
              <Trash2 size={12} />
            </Button>
          </li>
        ))}
      </ol>

      <p className="text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
        {colado
          ? 'O short toca os segmentos nesta ordem, um atrás do outro. Arraste as bordas na régua, ou use [ e ] para começar/terminar um segmento onde o player está. As setas mudam a ordem.'
          : 'Marque um segundo segmento para montar o short com trechos separados do bruto. O que fica entre eles não entra.'}
      </p>
    </div>
  );
}
