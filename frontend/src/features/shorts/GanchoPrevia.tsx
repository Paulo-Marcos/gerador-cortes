import { duracaoNoShort, ganchoVisivelEm } from './ganchoDoShort';
import { SAFE_ZONE } from './previaLegenda';

// D-565: o título-gancho desenhado por cima do player, como sairá no arquivo.
//
// Mesmo contrato da `LegendaPrevia`: fica DENTRO da janela 9:16 (o pai o
// posiciona sobre ela), e imita o `GanchoAbertura.tsx` do renderer de propósito
// — a prévia existe para julgar legibilidade e ocupação, e as duas dependem de
// corpo, ancoragem e véu serem os mesmos.
//
// Os dois convivem na tela: o gancho no terço superior, a legenda no rodapé. É
// a decisão que esta demanda tomou, e é aqui que ela fica visível ANTES do
// render — que é o ponto de ter prévia. Se ficar poluído, dá para ver e mudar
// sem gastar uma passada de render.

interface Props {
  /** Pode chegar vazio: short sem gancho e o caso comum. */
  texto: string | undefined;
  /** Quanto tempo o gancho fica em tela; null/0 = o padrão. */
  ateSeg: number | null;
  /** Bordas do short, na timeline do bruto. */
  inicioSeg: number;
  fimSeg: number;
  /** Onde o player está, na timeline do bruto. */
  tempoAtualSeg: number;
}

export function GanchoPrevia({ texto, ateSeg, inicioSeg, fimSeg, tempoAtualSeg }: Props) {
  const limpo = (texto ?? '').trim();
  if (!limpo) return null;

  // O tempo do player corre na timeline do BRUTO; o gancho nasce ancorado no
  // zero do short. Sem esta subtração ele apareceria no minuto do bruto que
  // coincide com os primeiros segundos — ou seja, quase nunca no lugar certo.
  const noShort = tempoAtualSeg - inicioSeg;
  const duracaoShort = Math.max(0, fimSeg - inicioSeg);
  if (!ganchoVisivelEm(noShort, ateSeg, duracaoShort)) return null;

  // Some com o mesmo fade do renderer: um corte seco na prévia faria o operador
  // julgar uma saída que o arquivo não tem.
  const restante = duracaoNoShort(ateSeg, duracaoShort) - noShort;
  const opacidade = Math.min(1, Math.max(0, restante / 0.3));

  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: opacidade }} aria-hidden>
      {/* Véu só no topo — o vídeo é o que segura o dedo, e escurecer o quadro
          inteiro enquanto a legenda também está lá é o que viraria poluição. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: '46%',
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 text-center"
        style={{ top: `${SAFE_ZONE * 100}%`, paddingLeft: '7%', paddingRight: '7%' }}
      >
        {/* O corpo sai da LARGURA da janela, não de um clamp em pixels.
            No renderer ele é `height * 0.05` sobre um quadro 1080x1920 — ou
            seja, 8,89% da largura. Com um clamp de piso alto o texto travava em
            12px numa janela de 294px (4%), e uma frase que ocupa TRÊS linhas no
            arquivo cabia em UMA na prévia. Aí a prévia deixa de responder a
            pergunta que a fez existir: isto polui a tela? */}
        <p
          className="font-display text-[clamp(9px,8.89cqw,96px)] font-black leading-[1.08] tracking-[-0.02em] text-white"
          style={{ textShadow: '0 6px 28px rgba(0,0,0,0.7)' }}
        >
          {limpo}
        </p>
      </div>
    </div>
  );
}
