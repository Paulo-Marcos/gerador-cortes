import { useMemo } from 'react';
import { paginaEm, paginasDoTrecho, SAFE_ZONE } from './previaLegenda';
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
}

export function LegendaPrevia({
  palavras,
  inicioSeg,
  fimSeg,
  tempoAtualSeg,
  cor = '',
  fonte = '',
}: Props) {
  const paginas = useMemo(
    () => paginasDoTrecho(palavras, inicioSeg, fimSeg),
    [palavras, inicioSeg, fimSeg],
  );

  // O tempo do player corre na timeline do BRUTO; as páginas nascem rebaseadas
  // ao zero do short. Sem esta subtração a legenda apareceria minutos adiante
  // — o mesmo erro que a `transcricao_final` já resolveu no corte.
  const pagina = paginaEm(paginas, tempoAtualSeg - inicioSeg);
  if (!pagina) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 text-center"
      style={{ bottom: `${SAFE_ZONE * 100}%` }}
      aria-hidden
    >
      <p
        className="mx-auto font-display text-[clamp(11px,2.6cqw,26px)] font-extrabold leading-[1.18] tracking-[-0.01em]"
        style={{
          width: '84%',
          // Vazio cai na `font-display` da classe, que e a do canal.
          fontFamily: fonte || undefined,
          textShadow:
            '0 2px 0 rgba(0,0,0,0.85), 0 -2px 0 rgba(0,0,0,0.85), 2px 0 0 rgba(0,0,0,0.85), -2px 0 0 rgba(0,0,0,0.85), 0 6px 18px rgba(0,0,0,0.55)',
        }}
      >
        {pagina.tokens.map((token, indice) => {
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
  );
}
