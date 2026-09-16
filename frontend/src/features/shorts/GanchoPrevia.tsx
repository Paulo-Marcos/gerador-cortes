import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  duracaoNoShort,
  estiloDoRealce,
  ganchoVisivelEm,
  lugarArrastado,
  lugarEfetivo,
  POSICAO_Y_PADRAO,
  tamanhoEfetivo,
  type LugarDoGancho,
} from './ganchoDoShort';

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
//
// D-581: e agora com a COR e o REALCE escolhidos. Foi essa coexistência que o
// operador viu ficar poluída — dois textos brancos disputando o mesmo quadro —
// e é aqui, antes do render, que ele julga se a cor nova resolveu.

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
  /** D-581: hex do texto. Vazio = branco. */
  cor?: string;
  /** D-581: veu | caixa | contorno | sombra | nenhum. */
  realce?: string;
  /** D-594: família da fonte. Vazio = a do canal. */
  fonte?: string;
  /** D-594: escala do corpo. 0/ausente = 1,0. */
  tamanho?: number;
  /** D-600: onde a caixa senta, já com a herança resolvida por quem chama. */
  lugar?: LugarDoGancho;
  /**
   * D-600: quando existe, o gancho vira arrastável.
   *
   * A prévia sempre foi só um espelho, e transformá-la em controle é uma
   * decisão, não um descuido: a pergunta "onde este gancho cabe" só se responde
   * OLHANDO o quadro, e obrigar o operador a mirar num campo numérico ao lado
   * seria pedir que ele traduza o que está vendo em dois números e de volta.
   *
   * Continua opcional: sem `onMover`, esta é a mesma prévia passiva de antes —
   * é ela que desenha no card, onde arrastar sem querer seria uma edição
   * silenciosa.
   */
  onMover?: (lugar: LugarDoGancho) => void;
}

export function GanchoPrevia({
  texto,
  ateSeg,
  inicioSeg,
  fimSeg,
  tempoAtualSeg,
  cor = '',
  realce = 'veu',
  fonte = '',
  tamanho = 0,
  lugar,
  onMover,
}: Props) {
  // O contorno e a caixa têm espessura proporcional ao CORPO, e o corpo aqui é
  // uma `cqw` — um valor que só o layout conhece. Medi-lo é o único jeito de a
  // prévia mostrar a mesma proporção que o arquivo terá: com um número fixo, o
  // mesmo contorno vira halo numa janela grande e mancha numa pequena.
  const paragrafo = useRef<HTMLParagraphElement>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const [corpoPx, setCorpoPx] = useState(16);
  const [arrastando, setArrastando] = useState(false);

  const limpo = (texto ?? '').trim();

  useLayoutEffect(() => {
    const el = paragrafo.current;
    if (!el) return;
    const medir = () => {
      const medido = Number.parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(medido) && medido > 0) setCorpoPx(medido);
    };
    medir();
    // A janela 9:16 cresce e encolhe com o painel (o palco abre, o modal
    // redimensiona). Sem observar, o realce ficaria com a proporção da primeira
    // medição — certo ao abrir e errado depois do primeiro arraste.
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, [limpo]);

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
  const estilo = estiloDoRealce(realce, corpoPx);
  const escala = tamanhoEfetivo(tamanho);
  const onde = lugar ?? lugarEfetivo(null, null);

  // O arraste converte pixels do ponteiro em % do QUADRO, e é por isso que ele
  // funciona igual numa janela de 220px e numa de 600px: o que se grava é a
  // proporção, que é a mesma coisa que o render de 1080x1920 vai ler.
  const iniciarArraste = (evento: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = quadro.current?.getBoundingClientRect();
    if (!onMover || !caixa || caixa.width <= 0 || caixa.height <= 0) return;
    evento.preventDefault();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    setArrastando(true);

    const partida = { x: evento.clientX, y: evento.clientY };
    const inicial = onde;

    const mover = (e: PointerEvent) => {
      onMover(
        lugarArrastado(
          inicial,
          ((e.clientX - partida.x) / caixa.width) * 100,
          ((e.clientY - partida.y) / caixa.height) * 100,
        ),
      );
    };
    const soltar = () => {
      setArrastando(false);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  return (
    <div
      ref={quadro}
      className="pointer-events-none absolute inset-0"
      style={{ opacity: opacidade }}
      aria-hidden
    >
      {/* Véu só no topo — o vídeo é o que segura o dedo, e escurecer o quadro
          inteiro enquanto a legenda também está lá é o que viraria poluição.
          D-581: e agora ele é UM dos realces, não mais o único desenho. */}
      {estilo.veu && (
        <div
          className="absolute inset-x-0"
          style={{
            // D-600: o véu viaja com o gancho — ele escurece o fundo de ONDE a
            // frase está, e o topo era só onde ela sempre estava. No lugar
            // padrão isto é exatamente o `top: 0` de antes.
            top: `${Math.max(0, onde.y - POSICAO_Y_PADRAO)}%`,
            height: '46%',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)',
          }}
        />
      )}
      <div
        onPointerDown={onMover ? iniciarArraste : undefined}
        className={
          onMover
            ? // A borda tracejada só aparece onde o arraste existe: ela é a
              // única pista de que a caixa se move, e num card passivo seria
              // um convite a um gesto que não acontece.
              'pointer-events-auto absolute select-none rounded-[6px] text-center outline-dashed outline-1 outline-offset-4 ' +
              (arrastando
                ? 'cursor-grabbing outline-[var(--wb-accent)]'
                : 'cursor-grab outline-white/30 hover:outline-[var(--wb-accent)]')
            : 'absolute text-center'
        }
        style={{
          // D-600: espelha o `GanchoAbertura.tsx` — `x` é o centro, `y` é o topo.
          top: `${onde.y}%`,
          left: `${onde.x}%`,
          width: `${onde.largura}%`,
          transform: 'translateX(-50%)',
          touchAction: onMover ? 'none' : undefined,
        }}
      >
        {/* O corpo sai da LARGURA da janela, não de um clamp em pixels.
            No renderer ele é `height * 0.05` sobre um quadro 1080x1920 — ou
            seja, 8,89% da largura. Com um clamp de piso alto o texto travava em
            12px numa janela de 294px (4%), e uma frase que ocupa TRÊS linhas no
            arquivo cabia em UMA na prévia. Aí a prévia deixa de responder a
            pergunta que a fez existir: isto polui a tela? */}
        <p
          ref={paragrafo}
          className="font-display font-black leading-[1.08] tracking-[-0.02em]"
          style={{
            // D-594: a escala multiplica a MESMA conta (8,89cqw = 5% da altura
            // do quadro), para prévia e arquivo seguirem concordando.
            fontSize: `clamp(9px, ${(8.89 * escala).toFixed(2)}cqw, ${Math.round(96 * escala)}px)`,
            fontFamily: fonte || undefined,
            color: cor || '#ffffff',
            ...estilo.texto,
          }}
        >
          {limpo}
        </p>
      </div>
    </div>
  );
}
