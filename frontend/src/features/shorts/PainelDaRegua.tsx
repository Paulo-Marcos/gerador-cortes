import type { ShortSugerido } from './shortsApi';
import type { Borda } from './linhaDoTempoShort';
import { LinhaDoTempo } from './LinhaDoTempo';
import { ReguaDeOnda } from './ReguaDeOnda';
import { useOndaDoBruto } from './useShortsDoCorte';

interface Props {
  corteId: string;
  /** `duracaoVideo || fire.duracao_seg` — a duração que a TELA conhece. */
  duracaoRegua: number;
  shorts: ShortSugerido[];
  emQuadro: ShortSugerido | undefined;
  tempoAtual: number;
  /** D-554: sem bruto em disco a queda para a régua lisa tem outra explicação. */
  temBruto: boolean | undefined;
  onSeek: (segundos: number) => void;
  onBordas: (shortId: string, bordas: { inicio?: number; fim?: number }, focar?: Borda) => void;
  onSelecionar: (shortId: string) => void;
}

/**
 * D-499/D-551: a régua do corte.
 *
 * O botão "Definir o palco" saiu daqui: ele repetia o do card do trecho, que é
 * onde a decisão mora, e a régua ficava com duas linhas e um botão a mais
 * embaixo da onda.
 *
 * O painel ROLA em vez de ser cortado. Ele cresce com o número de cenas; com
 * `flex-none` e o `overflow-hidden` do grid, as últimas linhas simplesmente
 * sumiam — sem barra, sem sinal, sem jeito de chegar nelas numa janela de 800px
 * de altura.
 *
 * A guarda de "há régua para desenhar?" mora AQUI dentro, e não no pai, para a
 * consulta da onda não nascer e morrer com ela: o cache é eterno por corte, e
 * montar o hook só depois que os candidatos chegam mudaria o instante do
 * pedido sem mudar nada na tela.
 */
export function PainelDaRegua({
  corteId,
  duracaoRegua,
  shorts,
  emQuadro,
  tempoAtual,
  temBruto,
  onSeek,
  onBordas,
  onSelecionar,
}: Props) {
  // D-541: a onda do bruto por tras da regua. Falha em silencio — sem bruto
  // legivel a regua fica lisa, que e exatamente como ela era antes disto.
  const onda = useOndaDoBruto(corteId);

  if (duracaoRegua <= 0 || shorts.length === 0) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
      {/* D-550: de volta a regua lisa enquanto a `ReguaDeOnda` nao
          desenha os blocos coloridos. Ela ja tem onda e zoom, mas os
          trechos nao aparecem — e perder a cor de cada trecho custa
          mais do que ganhar o zoom. O componente fica no repo. */}
      {/* D-551: a regua e o mesmo instrumento do editor de bruto —
          onda, zoom, scroll e um bloco colorido por trecho, com alca
          no que esta em foco. Sem picos (bruto ausente ou ilegivel)
          cai na regua lisa, que ainda serve para ver a distribuicao. */}
      {onda.data?.peaks?.length ? (
        <ReguaDeOnda
          corteId={corteId}
          // D-572: a duração dos PICOS, e não a da tela.
          //
          // `duracaoRegua` é `duracaoVideo || fire.duracao_seg`, e no
          // instante em que a régua nasce o `<video>` quase nunca leu os
          // metadados ainda — então ela nasce com o valor do BANCO. A
          // onda é criada uma vez só (de propósito: recriá-la a cada
          // refino de milissegundo foi o que quebrou a D-551), então
          // esse valor fica.
          //
          // E `duracao_clip_seg` envelhece: a D-362 já registrou isso
          // como risco residual. Quando ele envelhece, o wavesurfer
          // espalha os picos sobre uma duração que não é a do arquivo,
          // a onda ESTICA, e o desencontro cresce com o tempo — o áudio
          // deixa de bater com o desenho justamente no fim, que é onde
          // se marca o fim do trecho.
          //
          // `duration_sec` vem medido de `len(amostras)/sample_rate`
          // sobre o mesmo arquivo que o player toca. É a única das três
          // durações que não pode discordar dos picos.
          duracaoSeg={onda.data.duration_sec || duracaoRegua}
          picos={onda.data.peaks}
          shorts={shorts}
          emFoco={emQuadro ?? null}
          tempoAtual={tempoAtual}
          onSeek={onSeek}
          onBordas={onBordas}
          onSelecionar={onSelecionar}
        />
      ) : (
        <>
          <LinhaDoTempo
            duracaoSeg={duracaoRegua}
            shorts={shorts}
            emFoco={emQuadro}
            tempoAtual={tempoAtual}
            onSeek={onSeek}
            onBordas={onBordas}
          />
          {/* D-554: a queda para a régua lisa era MUDA.
              A onda e o zoom existem desde a D-551, mas dependem dos
              picos do bruto — e sem bruto em disco a tela trocava de
              instrumento sem dizer nada. De fora, isso é
              indistinguível de "pediram zoom e não implementaram":
              o operador procura o botão, não acha, e conclui que a
              funcionalidade não veio. A régua lisa continua sendo a
              resposta certa; o que faltava era ela se explicar. */}
          {!onda.isLoading && (
            <p className="mt-1.5 font-code text-[10.5px] leading-relaxed text-[var(--wb-text-mute)]">
              {temBruto === false
                ? 'Régua lisa: sem o bruto em disco não há onda nem zoom. Gere o bruto deste corte para ter a régua do editor.'
                : 'Régua lisa: não deu para ler o áudio do bruto, então não há onda nem zoom neste corte.'}
            </p>
          )}
        </>
      )}
      {/* D-560: o painel de bordas finas saiu. Ele existia porque a
          régua não tinha resolução para encostar no milésimo — os
          campos eram a única via. Agora a régua abre a 50px/s e vai a
          20x, e cada pixel vale milissegundos: a alça faz o que os
          campos faziam, olhando para a onda em vez de para um número. */}
      {/* D-560: as CENAS saíram da tela junto com o render. O
          `CENAS_LIGADAS` do `render_short.py` é o interruptor único para
          religar as duas pontas; o componente e os dados ficam onde estão. */}
    </div>
  );
}
