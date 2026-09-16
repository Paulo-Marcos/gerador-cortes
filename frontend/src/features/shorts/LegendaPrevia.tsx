import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { lugarArrastado, lugarEfetivo, paginaEm, paginasDoTrecho } from './previaLegenda';
import type { LugarDaLegenda } from './previaLegenda';
import type { PalavraTranscrita } from './shortsApi';

// D-479: a legenda desenhada por cima do player, como sairá no arquivo.
//
// Fica DENTRO da janela 9:16 (o componente é posicionado pelo pai sobre ela),
// e não sobre o quadro 16:9 inteiro: no arquivo final a legenda vive no
// vertical, e mostrá-la centrada no horizontal seria prometer um enquadramento
// que o render não entrega.
//
// O estilo imita `LegendaShort.tsx` do renderer — contorno em vez de caixa
// (caixa esconde o vídeo, e o vídeo é o que segura o dedo), realce na palavra
// corrente, dentro da safe zone. É imitação declarada, não coincidência: a
// prévia serve para julgar legibilidade e quebra de linha, e as duas dependem
// disso. A QUEBRA em si não é imitada — vem da mesma função do render.

// D-605: a LARGURA saiu daqui e virou `LARGURA_PADRAO` em `previaLegenda.ts`,
// ao lado do resto do lugar. A razão da D-568 continua valendo e mora lá: 80%
// deixa 10% de cada lado, porque no 9:16 o texto colado na borda é o primeiro a
// ser cortado pela moldura de qualquer player — e a legenda é o conteúdo.

// D-563: as cores oferecidas para a palavra corrente.
//
// O catálogo é de APRESENTAÇÃO — o que se grava no short é o hex, não a chave.
// Assim o renderer não precisa conhecer esta lista: ele recebe a cor pronta.
// Uma chave obrigaria os dois lados a manterem a mesma tabela, e a D-558 já
// mostrou o preço disso (o `StageChrome` do frontend ficou anos com o quadro do
// horizontal cravado enquanto o do renderer aprendia a receber o dele).
//
// As duas primeiras vêm da identidade do canal: o azul do HUD é o realce de
// hoje, e o verde é o dos brackets do palco. O verde-escuro é o que o operador
// pediu para combinar com o fundo — fica na lista mesmo sendo o mais arriscado
// sobre vídeo claro, porque é ele quem julga isso olhando.
export const CORES_DA_LEGENDA: readonly { hex: string; nome: string }[] = [
  { hex: '#9bcfe3', nome: 'azul do HUD (padrão)' },
  { hex: '#6aaa84', nome: 'verde do palco' },
  { hex: '#2f5f43', nome: 'verde escuro' },
  { hex: '#facc15', nome: 'amarelo' },
  { hex: '#ff8a3d', nome: 'laranja' },
  { hex: '#ff5a72', nome: 'rosa' },
  { hex: '#c9a4ff', nome: 'lilás' },
  { hex: '#ffffff', nome: 'branco (sem realce)' },
];

// D-563: as fontes oferecidas para a legenda.
//
// Mesma regra das cores: o que se grava e o VALOR — aqui o nome da familia
// ("Anton") — e nao uma chave que os dois lados teriam de traduzir. O renderer
// carrega exatamente estas familias e usa o nome como veio; o navegador as
// recebe pelo `<link>` do `index.html`.
//
// Sao as que o formato pede: peso alto e desenho estreito, que e o que cabe em
// 4 a 7 palavras por pagina sem quebrar linha no meio de uma ideia. Anton e
// Bebas Neue so tem o peso 400, e tudo bem — as duas ja nascem pesadas, e o
// engrossamento sintetico sai igual nos dois lados porque os dois sao Chromium.
//
// ATENCAO ao acrescentar uma: ela precisa entrar em TRES lugares — aqui, no
// `<link>` do `index.html` e nos `loadFont` do `LegendaShort.tsx`. Faltando o
// do renderer, a previa mostra a fonte nova e o arquivo sai com a padrao.
export const FONTES_DA_LEGENDA: readonly { familia: string; nome: string }[] = [
  { familia: '', nome: 'a do canal (padrão)' },
  { familia: 'Anton', nome: 'Anton — estreita e pesada' },
  { familia: 'Bebas Neue', nome: 'Bebas Neue — alta e condensada' },
  { familia: 'Montserrat', nome: 'Montserrat — larga e redonda' },
  { familia: 'Poppins', nome: 'Poppins — geométrica' },
  { familia: 'Oswald', nome: 'Oswald — condensada clássica' },
];

interface Props {
  palavras: PalavraTranscrita[];
  /** Bordas do short, na timeline do bruto. */
  inicioSeg: number;
  fimSeg: number;
  /** Onde o player está, na timeline do bruto. */
  tempoAtualSeg: number;
  /** D-563: hex da palavra corrente. Vazio = o acento do canal. */
  cor?: string;
  /** D-563: família da fonte. Vazio = a do canal. */
  fonte?: string;
  /** D-605: onde a caixa senta, já com a herança resolvida por quem chama. */
  lugar?: LugarDaLegenda;
  /**
   * D-605: quando existe, a legenda vira arrastável.
   *
   * A prévia sempre foi só um espelho, e transformá-la em controle é a mesma
   * decisão que a `GanchoPrevia` tomou na D-600: a pergunta "esta legenda está em
   * cima da cara de alguém?" só se responde OLHANDO o quadro, e um campo numérico
   * ao lado obrigaria o operador a traduzir o que vê em dois números e de volta.
   *
   * Continua opcional: sem `onMover`, esta é a mesma prévia passiva de antes — é
   * ela que desenha no card e no player, onde arrastar sem querer seria uma
   * edição silenciosa.
   */
  onMover?: (lugar: LugarDaLegenda) => void;
  /**
   * D-605: o lugar FINAL, uma vez por gesto — é este que vai ao banco.
   *
   * Separado do `onMover` de propósito, e pela mesma razão que o `EditorDePalco`
   * separa `onArrastando` de `onGravar`: um PATCH por `pointermove` seriam
   * dezenas de requisições num arraste de dois segundos, e a última a responder
   * nem sempre é a última a ser enviada — o short acabaria gravado numa posição
   * pela qual o ponteiro só passou.
   */
  onSoltar?: (lugar: LugarDaLegenda) => void;
}

export function LegendaPrevia({
  palavras,
  inicioSeg,
  fimSeg,
  tempoAtualSeg,
  cor = '',
  fonte = '',
  lugar,
  onMover,
  onSoltar,
}: Props) {
  const quadro = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const paginas = useMemo(
    () => paginasDoTrecho(palavras, inicioSeg, fimSeg),
    [palavras, inicioSeg, fimSeg],
  );

  // O tempo do player corre na timeline do BRUTO; as páginas nascem rebaseadas
  // ao zero do short. Sem esta subtração a legenda apareceria minutos adiante
  // — o mesmo erro que a `transcricao_final` já resolveu no corte.
  const pagina = paginaEm(paginas, tempoAtualSeg - inicioSeg);
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
    let ultimo = inicial;

    const mover = (e: PointerEvent) => {
      ultimo = lugarArrastado(
        inicial,
        ((e.clientX - partida.x) / caixa.width) * 100,
        ((e.clientY - partida.y) / caixa.height) * 100,
      );
      onMover(ultimo);
    };
    const soltar = () => {
      setArrastando(false);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      onSoltar?.(ultimo);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  // Sem página não há legenda — MENOS quando se está posicionando: some com ela
  // no primeiro silêncio da fala e o operador perde a caixa da mão no meio do
  // gesto. Em modo arraste sobra o contorno, que é o que ele está mirando.
  if (!pagina && !onMover) return null;

  return (
    <div ref={quadro} className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        onPointerDown={onMover ? iniciarArraste : undefined}
        className={
          onMover
            ? // A borda tracejada só aparece onde o arraste existe: ela é a única
              // pista de que a caixa se move, e num card passivo seria um convite
              // a um gesto que não acontece.
              'pointer-events-auto absolute select-none rounded-[6px] text-center outline-dashed outline-1 outline-offset-4 ' +
              (arrastando
                ? 'cursor-grabbing outline-[var(--wb-accent)]'
                : 'cursor-grab outline-white/30 hover:outline-[var(--wb-accent)]')
            : 'absolute text-center'
        }
        style={{
          // D-605: `x` é o centro e `y` é a BASE — daí o `bottom` sair de
          // `100 - y`, que é a mesma conta do `LegendaShort.tsx` do renderer.
          left: `${onde.x}%`,
          bottom: `${100 - onde.y}%`,
          width: `${onde.largura}%`,
          transform: 'translateX(-50%)',
          touchAction: onMover ? 'none' : undefined,
          // Num silêncio a caixa fica vazia; sem altura mínima ela não teria onde
          // ser agarrada.
          minHeight: pagina ? undefined : '8%',
        }}
      >
        <p
          // D-568: `7.47cqw` é o tamanho do ARQUIVO, convertido.
          //
          // O render usa `height * 0.042` — 81px num quadro de 1920 de altura,
          // que são 7,47% dos 1080 de largura. A prévia usava 2,6cqw e um teto
          // de 26px: mostrava a legenda a 4,6% do quadro, quase três vezes menor
          // que a que ia sair. O operador aprovava um texto que cabia e recebia
          // outro que não cabia — "fica muito grande, às vezes até some".
          //
          // A `GanchoPrevia` já fazia essa conta certa (8.89cqw = 0,05 × 16/9);
          // a legenda é que ficou para trás desde a D-479.
          className="font-display text-[clamp(9px,7.47cqw,96px)] font-extrabold leading-[1.18] tracking-[-0.01em]"
          style={{
            // D-605: a largura passou a ser da CAIXA (a div de fora) — é ela que
            // se arrasta e se mede.
            width: '100%',
            // Palavra longa QUEBRA em vez de furar a caixa. Sem isto ela passava
            // por fora do quadro e sumia recortada — o "some" do relato.
            overflowWrap: 'break-word',
            // Vazio cai na `font-display` da classe, que e a do canal.
            fontFamily: fonte || undefined,
            textShadow:
              '0 2px 0 rgba(0,0,0,0.85), 0 -2px 0 rgba(0,0,0,0.85), 2px 0 0 rgba(0,0,0,0.85), -2px 0 0 rgba(0,0,0,0.85), 0 6px 18px rgba(0,0,0,0.55)',
          }}
        >
          {/* `pagina` pode ser nula em modo arraste: no silêncio da fala fica só
              a caixa, que é o que o operador está posicionando. */}
          {pagina?.tokens.map((token, indice) => {
            const noShort = tempoAtualSeg - inicioSeg;
            const corrente = noShort >= token.deSeg && noShort < token.ateSeg;
            return (
              <span
                key={`${token.deSeg}-${indice}`}
                style={{
                  whiteSpace: 'pre',
                  color: corrente ? cor || 'var(--wb-accent)' : '#ffffff',
                }}
              >
                {token.texto}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}
