import { useEffect, useRef, type RefObject } from 'react';
import { YoutubeBackground } from '@/features/editor/fase2/youtubeBackgrounds';
import {
  DEFAULT_YOUTUBE_BACKGROUND,
  YOUTUBE_BACKGROUND_IDS,
  type YoutubeBackgroundId,
} from '@/features/editor/fase2/youtubeLayout';
import {
  CardChrome,
  StageChrome,
  buildChromePaths,
  chromeClipPath,
} from '@/features/editor/fase2/youtubeChrome';
import type { PlanoDesenhavel } from './shortsApi';

// E-036/D-489: o palco desenhado ao vivo, como o arquivo vai sair.
//
// ## D-549: a prévia mostrava uma moldura que o arquivo não teria
//
// Ela pintava as faixas do canal como retângulos de COR CHAPADA e o fundo como
// uma cor da paleta. O arquivo nunca teve isso: o render sobrepõe um PNG com a
// textura editorial do canal, chrome e molduras (D-508). Duas telas do mesmo
// short discordando — e a que o operador julga é esta.
//
// O horizontal já resolvia isso, e resolvia do jeito certo: a prévia de cenas
// (`CenasRemotionPreview`) monta `YoutubeBackground` como CAMADA REACT, com os
// mesmos componentes que o renderer usa. Existe uma cópia deles no frontend
// exatamente para isso.
//
// Então esta prévia passou a compor as mesmas três camadas do
// `palco-short-entry.tsx`:
//
//   1. fundo editorial com textura   (atrás de tudo)
//   2. o vídeo, recortado nos slots  (canvas — transparente fora deles)
//   3. chrome: moldura das janelas e trilho do palco
//
// ## Por que o vídeo continua em canvas
//
// O `drawImage` tem exatamente a semântica do crop + scale + overlay do ffmpeg:
// retângulo de origem, retângulo de destino, área de clip. O backend manda os
// três números por recorte e a tela só os aplica — a conta continua sendo uma
// só, no domínio. Trocar isso por DOM criaria a segunda implementação da
// geometria, que é o risco que este épico existe para evitar.
//
// O que mudou é que o canvas parou de pintar FUNDO. Ele agora é transparente
// fora dos recortes, e é isso que deixa a textura aparecer por baixo — do mesmo
// jeito que o PNG do render tem as janelas vazadas.

interface Props {
  plano: PlanoDesenhavel;
  /** O player que o operador está scrubbing — a fonte dos quadros. */
  video: RefObject<HTMLVideoElement | null>;
  children?: React.ReactNode;
}

/** O mesmo recorte das janelas do palco vertical (`OPTS_COM_MARGEM`). */
const OPTS_DA_JANELA = { radius: 26, chamferTR: 58, chamferBR: 32, offset: 10 };
const OPTS_COLADA = { radius: 0, chamferTR: 0, chamferBR: 0, offset: 8 };

/** O trilho do chrome, em px do quadro — espelha `StageChrome pad` do renderer. */
const PAD_DO_TRILHO = 40;

export function PalcoPrevia({ plano, video, children }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tela = canvas.current;
    const ctx = tela?.getContext('2d');
    if (!tela || !ctx) return;

    let vivo = true;

    const desenhar = () => {
      if (!vivo) return;
      requestAnimationFrame(desenhar);

      const fonte = video.current;
      // `readyState < 2` = ainda não há quadro decodificado. Desenhar aqui
      // levanta InvalidStateError em alguns navegadores e pinta lixo nos
      // outros.
      if (!fonte || fonte.readyState < 2) return;

      // LIMPA, não preenche: o que estiver fora dos recortes tem de deixar a
      // textura do fundo aparecer, como as janelas vazadas do PNG do render.
      ctx.clearRect(0, 0, tela.width, tela.height);

      for (const recorte of plano.recortes) {
        const { origem, destino, recorta } = recorte;
        ctx.save();
        // O clip é o que faz o excesso do COBRIR ficar de fora — o destino
        // começa fora do slot de propósito, exatamente como no filtergraph.
        //
        // D-559: e o clip é o CHANFRO, não um retângulo.
        //
        // O canto superior direito do chrome é cortado na diagonal (e o
        // inferior direito também, mais discreto). Com `ctx.rect` o vídeo
        // mantinha os cantos quadrados e escapava POR FORA da linha ali —
        // "no canto direito a imagem está passando da borda". O arquivo nunca
        // teve isso: o `palco-short-entry.tsx` vaza as janelas do PNG com
        // `buildChromePaths(...).main`, este mesmo desenho.
        //
        // `Path2D` aceita a string de path do SVG, então a forma é literalmente
        // a mesma dos dois lados — nada de reimplementar o chanfro em canvas.
        // De `plano.canvas`, e não das constantes desestruturadas lá embaixo:
        // o efeito depende de `plano`, e ler daqui mantém a dependência única.
        const opts = optsDa(recorta, plano.canvas.largura, plano.canvas.altura);
        ctx.translate(recorta.x, recorta.y);
        ctx.clip(new Path2D(buildChromePaths(recorta.w, recorta.h, opts).main));
        // Volta ao referencial do quadro: o clip já ficou gravado onde estava,
        // e `destino` vem em coordenadas do canvas.
        ctx.translate(-recorta.x, -recorta.y);
        ctx.drawImage(
          fonte,
          origem.x,
          origem.y,
          origem.w,
          origem.h,
          destino.x,
          destino.y,
          destino.w,
          destino.h,
        );
        ctx.restore();
      }
    };

    requestAnimationFrame(desenhar);
    return () => {
      vivo = false;
    };
  }, [plano, video]);

  const { largura, altura } = plano.canvas;
  const comMoldura = plano.moldura !== 'nenhuma';
  // D-554: um `as YoutubeBackgroundId` no id que vem do backend era uma
  // promessa que o TypeScript não tinha como cobrar. O dia em que ela foi
  // quebrada — um preset antigo trazia a chave de paleta "verdeProfundo" no
  // campo que virou textura — o componente de fundo recebeu um id sem
  // componente, devolveu `undefined`, e a tela inteira dos shorts caiu.
  //
  // O backend já não deixa mais o id inválido sair, e mesmo assim a checagem
  // fica aqui: é a prévia que morre se ela falhar, e uma prévia com a textura
  // errada é infinitamente melhor que uma tela em branco.
  const textura = (YOUTUBE_BACKGROUND_IDS as readonly string[]).includes(plano.fundo_editorial)
    ? (plano.fundo_editorial as YoutubeBackgroundId)
    : DEFAULT_YOUTUBE_BACKGROUND;

  return (
    <div
      // `h-full w-auto` + aspectRatio: a altura vem da linha (que o player
      // define) e a largura sai da proporcao. Sem a altura definida, um
      // contentor que so tem aspect-ratio colapsa para largura zero.
      className="relative h-full w-auto overflow-hidden rounded-[10px]"
      // O container é um container de consulta para a legenda se dimensionar
      // em `cqw`, como faz sobre a máscara.
      //
      // D-559: e o fundo é PRETO só quando há moldura — ali a textura cobre e a
      // cor não aparece nem no arquivo. Sem moldura não há PNG, e o que o
      // ffmpeg pinta debaixo de tudo é justamente `plano.fundo`, a cor da
      // paleta do canal. Isso não fazia diferença enquanto a janela cobria o
      // quadro inteiro; passou a fazer agora que ela pode encolher, e um preto
      // aqui contra uma cor lá seria a divergência da D-549 de novo, só que do
      // outro lado.
      style={{
        aspectRatio: `${largura} / ${altura}`,
        containerType: 'inline-size',
        background: comMoldura ? '#000' : plano.fundo,
      }}
    >
      {/* Camada 1 — o fundo editorial do canal. O mesmo id que o render manda
          para o PNG, então a textura aqui é a textura de lá. */}
      {comMoldura && (
        <div className="absolute inset-0">
          <YoutubeBackground fundo={textura} />
        </div>
      )}

      {/* Camada 2 — o vídeo nos slots, transparente no resto. */}
      <canvas
        ref={canvas}
        width={largura}
        height={altura}
        className="absolute inset-0 h-full w-full"
      />

      {/* Camada 3 — o chrome: a moldura de cada janela e o trilho do palco.
          Em px do QUADRO, escalados junto com ele por `viewBox`. */}
      {comMoldura && (
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <foreignObject x={0} y={0} width={largura} height={altura}>
            <div style={{ position: 'relative', width: largura, height: altura }}>
              {plano.recortes.map((recorte) => (
                <div
                  key={`${recorte.recorta.x}-${recorte.recorta.y}-${recorte.recorta.w}`}
                  style={{
                    position: 'absolute',
                    left: recorte.recorta.x,
                    top: recorte.recorta.y,
                    width: recorte.recorta.w,
                    height: recorte.recorta.h,
                  }}
                >
                  {/* D-559: linha fina e SEM brackets — os mesmos parâmetros
                      da camada 3 do `palco-short-entry.tsx`.

                      A prévia usava os defaults (`outlineScale` 1 e brackets
                      ligados), então cada janela vinha com um contorno três
                      vezes mais grosso que o do arquivo, mais quatro cantos que
                      o arquivo não tem. Com a janela encolhida isso encostou no
                      trilho do palco e virou o que se via: duas bordas, uma
                      dentro da outra. Os cantos são a assinatura do PALCO; o
                      que a janela leva é só o fio que a separa do fundo. */}
                  <CardChrome
                    width={recorte.recorta.w}
                    height={recorte.recorta.h}
                    opts={optsDa(recorte.recorta, largura, altura)}
                    outlineScale={0.3}
                    showBrackets={false}
                  />
                </div>
              ))}
              {/* D-558: o quadro VAI JUNTO. Sem ele o trilho saia com a
                  geometria do horizontal (1920x1080) dentro de um quadro em pe
                  — a "borda que nao contorna nada". O renderer sempre passou;
                  era esta copia que nao sabia perguntar. */}
              <StageChrome pad={PAD_DO_TRILHO} canvasW={largura} canvasH={altura} />
            </div>
          </foreignObject>
        </svg>
      )}

      {children}
    </div>
  );
}

/**
 * O chanfro desta janela — o mesmo `optsDa` do `palco-short-entry.tsx`.
 *
 * Uma janela colada nas bordas não leva canto arredondado: arredondar uma
 * janela de tela cheia deixaria quatro cantos de fundo aparecendo num short que
 * era para ser, justamente, tela cheia.
 *
 * D-559: virou função porque agora tem DOIS leitores — o clip do canvas e o
 * contorno do chrome. Enquanto era uma expressão repetida, nada impedia os dois
 * de discordarem, e a divergência apareceria como uma sobra de vídeo do lado de
 * fora da linha.
 */
function optsDa(
  r: { x: number; y: number; w: number; h: number },
  largura: number,
  altura: number,
): typeof OPTS_DA_JANELA {
  const colada = r.x <= 1 && r.y <= 1 && r.w >= largura - 1 && r.h >= altura - 1;
  return colada ? OPTS_COLADA : OPTS_DA_JANELA;
}

export { chromeClipPath };
