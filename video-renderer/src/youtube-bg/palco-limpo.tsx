import { type FC, type ReactNode } from "react";

/**
 * O palco "limpo" (D-911): fundo chapado, janelas com cantos arredondados e
 * nada desenhado além do vídeo e do texto.
 *
 * ESPELHO de `frontend/src/shared/palco/palcoLimpo.tsx`. As duas cópias
 * existem pelo mesmo motivo que `chrome.tsx` tem a sua: o renderer rasteriza
 * o PNG do palco e o frontend desenha a prévia, e a geometria de um tem de
 * casar com a do outro. Mantenha os números em sincronia.
 *
 * ## Por que não é mais um `ChromeOpts`
 *
 * O chrome atual é um desenho só com parâmetros (chanfro, brackets, traço). O
 * limpo não tem chanfro, não tem bracket e não tem traço: é outra composição.
 * Encaixá-la no mesmo componente por flags deixaria as duas difíceis de ler, e
 * o que protege o palco atual é justamente ele não mudar (D-508).
 */

export const COR_DO_FUNDO = "#121417";
export const COR_DO_TEXTO = "#F3F2EE";
export const COR_DO_ACENTO = "#FF6E5A";

/** Cantos das janelas, em px do quadro. */
export const RAIO_DA_TELA = 20;
export const RAIO_DA_FACECAM = 14;
export const RAIO_DA_JANELA_DO_SHORT = 24;

export const SOMBRA_DA_JANELA = "drop-shadow(0 30px 60px rgba(0,0,0,0.45))";

/** Onde o cabeçalho senta no horizontal (a margem do palco). */
export const CABECALHO_HORIZONTAL = { x: 64, y: 64 } as const;
export const ALTURA_DO_CABECALHO = 44;
/** No short, o cabeçalho fica na faixa acima da primeira janela, se ela existir. */
export const CABECALHO_SHORT_X = 48;
const FOLGA_DO_CABECALHO_NO_SHORT = 120;
const FAIXA_MINIMA_PARA_O_CABECALHO = 200;

/** A placa do interlocutor fica acima da tela, encostada à esquerda. */
export const ALTURA_DA_PLACA = 56;
/** Folga entre a placa e a borda da tela, dos dois lados dela. */
export const FOLGA_DA_PLACA = 8;
/** Largura que o cabeçalho pode ocupar: imagem + nome + @ em uma linha. */
const LARGURA_RESERVADA_DO_CABECALHO = 760;
const RECUO_DA_PLACA_DENTRO_DA_TELA = 24;
/** O que a placa precisa de largura para caber à direita do cabeçalho. */
const LARGURA_MINIMA_DA_PLACA = 400;

// Inter: a única família que o renderer (`@remotion/google-fonts`) e o
// frontend (index.html) já carregam dos dois lados. O preset tipográfico do
// estilo limpo é assunto do PR das cenas; o palco só precisa de uma letra igual
// na prévia e no PNG.
const FONTE = "'Inter', 'Segoe UI', sans-serif";

/** Onde um componente senta, em px do quadro; `automatica` = a regra do estilo. */
export interface PosicaoDoComponente {
  automatica: boolean;
  x: number;
  y: number;
}

// Posição, tamanho e contorno são opcionais no TIPO: um props.json gravado antes
// deles não os traz, e o palco sai como saía — os padrões são os números de antes.
export interface ComponentesDoPalco {
  estilo: "atual" | "limpo";
  cabecalho: {
    ativo: boolean;
    nome: string;
    handle: string;
    imagem: string;
    escala?: number;
    posicao?: PosicaoDoComponente;
    posicao_short?: PosicaoDoComponente;
  };
  placa: { ativo: boolean; escala?: number; posicao?: PosicaoDoComponente };
  /** Quanto as janelas do short recuam das bordas (px); 0 = sem contorno. */
  contorno_short?: number;
  /** O fundo do estilo limpo (`FUNDOS_DO_LIMPO`); ausente = o padrão. */
  fundo?: string;
  /**
   * D-913: o short leva o eco do vídeo nas faixas. O PNG então NÃO pinta fundo
   * (fica transparente fora das sombras e do cabeçalho), e quem mostra as faixas
   * é o vídeo desfocado que o FFmpeg põe por baixo.
   */
  eco_no_short?: boolean;
}

/**
 * Os fundos do estilo limpo: um grafite que não é 100 % chapado.
 *
 * Saíram de quatro rodadas de prévia sobre vídeo real da PROD (13/10/2026). O
 * escolhido é a retícula em halftone com a aurora por baixo, as duas no eixo
 * inferior-esquerdo → superior-direito; os outros são as variações do mesmo
 * vocabulário que o canal pode trocar sem mudar de identidade. Todos
 * procedurais (CSS/SVG), sem PNG, e todos estáticos: um fundo que se mexe
 * disputaria com o vídeo.
 */
export const FUNDOS_DO_LIMPO = ["reticula-aurora", "reticula", "aurora", "linho", "chapado"] as const;
export type FundoDoLimpo = (typeof FUNDOS_DO_LIMPO)[number];
export const FUNDO_PADRAO_DO_LIMPO: FundoDoLimpo = "reticula-aurora";

const VINHETA = "radial-gradient(ellipse 70% 65% at 50% 45%, transparent 55%, rgba(0,0,0,0.38) 100%)";
const COR_DA_TRAMA = "rgba(243,242,238,0.075)";

/** Grão fotográfico: ruído fino e monocromático. Esconde o banding dos gradientes. */
const Grao: FC<{ opacidade: number }> = ({ opacidade }) => (
  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: opacidade }} aria-hidden>
    <filter id="grao-do-palco">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#grao-do-palco)" />
  </svg>
);

/** A luz do palco: coral no canto inferior esquerdo, petróleo no superior direito. */
const Aurora: FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(ellipse 55% 60% at 4% 96%, rgba(255,110,90,0.30) 0%, transparent 65%)," +
        "radial-gradient(ellipse 55% 60% at 98% 4%, rgba(40,110,120,0.36) 0%, transparent 65%)",
    }}
  />
);

/**
 * A retícula: dois aglomerados de pontos, um no canto inferior esquerdo e outro
 * no superior direito, e o meio limpo — onde ficam as janelas. Cada aglomerado
 * é halftone de verdade: o ponto é maior no canto e encolhe até sumir. O de
 * baixo pesa um pouco mais, porque é onde a aurora coral também está.
 */
const CANTOS_DA_RETICULA = [
  { canto: "0% 100%", raio: 2.6, alcance: "55% 70%", alfa: 0.24 },
  { canto: "100% 0%", raio: 2.0, alcance: "45% 60%", alfa: 0.2 },
];
const PASSO_DA_RETICULA = 22;

const Reticula: FC = () => (
  <>
    {CANTOS_DA_RETICULA.map(({ canto, raio, alcance, alfa }) => {
      const mascara = `radial-gradient(ellipse ${alcance} at ${canto}, #000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)`;
      return (
        <div
          key={canto}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `radial-gradient(circle, rgba(243,242,238,${alfa}) ${raio}px, transparent ${raio + 0.6}px)`,
            backgroundSize: `${PASSO_DA_RETICULA}px ${PASSO_DA_RETICULA}px`,
            WebkitMaskImage: mascara,
            maskImage: mascara,
          }}
        />
      );
    })}
  </>
);

/** Trama diagonal fina: tecido, não grade. */
const Linho: FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage:
        `repeating-linear-gradient(45deg, ${COR_DA_TRAMA} 0 1px, transparent 1px 4px),` +
        `repeating-linear-gradient(-45deg, ${COR_DA_TRAMA} 0 1px, transparent 1px 4px)`,
    }}
  />
);

/** O fundo do palco limpo. Fundo desconhecido cai no padrão: render antigo não quebra. */
export const FundoLimpo: FC<{ fundo?: string }> = ({ fundo = FUNDO_PADRAO_DO_LIMPO }) => {
  const escolhido = (FUNDOS_DO_LIMPO as readonly string[]).includes(fundo) ? fundo : FUNDO_PADRAO_DO_LIMPO;
  const base = { position: "absolute" as const, inset: 0, background: COR_DO_FUNDO };
  if (escolhido === "chapado") return <div style={base} />;
  return (
    <div style={base}>
      {escolhido === "reticula-aurora" || escolhido === "aurora" ? <Aurora /> : null}
      <Grao opacidade={escolhido === "linho" ? 0.05 : 0.12} />
      {escolhido === "reticula-aurora" || escolhido === "reticula" ? <Reticula /> : null}
      {escolhido === "linho" ? <Linho /> : null}
      <div style={{ position: "absolute", inset: 0, background: VINHETA }} />
    </div>
  );
};

export const COMPONENTES_PADRAO: ComponentesDoPalco = {
  estilo: "atual",
  cabecalho: { ativo: true, nome: "", handle: "", imagem: "" },
  placa: { ativo: true },
};

export interface Janela {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Uma janela que atravessa o quadro de lado a lado (ou de cima a baixo) não leva
 *  canto: um canto arredondado ali é um triângulo de fundo aparecendo na borda. */
export function raioDaJanela(janela: Janela, canvasW: number, canvasH: number, raio: number): number {
  const deLadoALado = janela.x <= 1 && janela.w >= canvasW - 1;
  const deCimaABaixo = janela.y <= 1 && janela.h >= canvasH - 1;
  return deLadoALado || deCimaABaixo ? 0 : raio;
}

/**
 * A janela: o buraco transparente com os cantos arredondados e a sombra em volta.
 *
 * O corpo preto é removido pela máscara do palco (janela transparente); a
 * sombra, que vaza para fora do corpo, sobrevive no fundo. É o mesmo truque do
 * `ShadowCaster` do chrome atual.
 */
export const SombraDaJanela: FC<{ janela: Janela; raio: number }> = ({ janela, raio }) => (
  <div
    style={{
      position: "absolute",
      left: janela.x,
      top: janela.y,
      width: janela.w,
      height: janela.h,
      filter: SOMBRA_DA_JANELA,
    }}
  >
    <div style={{ position: "absolute", inset: 0, borderRadius: raio, background: "black" }} />
  </div>
);

/** O cabeçalho do canal: imagem redonda + nome + @. A imagem vem pronta de quem
 *  chama (um `<Img>` do Remotion), porque só o entry sabe resolver o `staticFile`. */
export const CabecalhoDoCanal: FC<{
  x: number;
  y: number;
  nome: string;
  handle: string;
  imagem?: ReactNode;
  /** Tamanho: escala a partir do canto superior esquerdo (1 = o de sempre). */
  escala?: number;
}> = ({ x, y, nome, handle, imagem, escala = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `scale(${escala})`,
      transformOrigin: "0 0",
      height: ALTURA_DO_CABECALHO,
      display: "flex",
      alignItems: "center",
      gap: 18,
      fontFamily: FONTE,
      color: COR_DO_TEXTO,
      whiteSpace: "nowrap",
    }}
  >
    {imagem ?? null}
    {nome ? (
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 }}>
        {nome}
      </div>
    ) : null}
    {handle ? (
      <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1, color: "rgba(243,242,238,0.55)" }}>
        {handle}
      </div>
    ) : null}
  </div>
);

/** A placa do interlocutor no estilo limpo: só texto, sem pílula. */
export const PlacaLimpa: FC<{
  x: number;
  y: number;
  nome?: string;
  papel?: string;
  /** Sobre o vídeo (dentro da tela) o texto leva sombra para continuar legível. */
  sobreVideo?: boolean;
  /** Tamanho: escala a partir do canto superior esquerdo (1 = o de sempre). */
  escala?: number;
}> = ({ x, y, nome, papel, sobreVideo = false, escala = 1 }) => {
  if (!nome && !papel) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${escala})`,
        transformOrigin: "0 0",
        height: ALTURA_DA_PLACA,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: FONTE,
        whiteSpace: "nowrap",
        textShadow: sobreVideo ? "0 2px 12px rgba(0,0,0,0.6)" : undefined,
      }}
    >
      {nome ? (
        <div style={{ fontSize: 28, fontWeight: 800, color: COR_DO_TEXTO, lineHeight: 1 }}>{nome}</div>
      ) : null}
      {papel ? (
        <div style={{ fontSize: 20, fontWeight: 600, color: COR_DO_ACENTO, lineHeight: 1 }}>{papel}</div>
      ) : null}
    </div>
  );
};

/**
 * Onde a placa do interlocutor senta no horizontal.
 *
 * Acima da tela, encostada à esquerda, como sempre — a não ser que ali ela
 * caia em cima do cabeçalho (tela que começa alta e à esquerda). Aí ela
 * desliza para a direita do cabeçalho, ainda acima da tela; e só quando nem
 * isso cabe (tela estreita e alta) entra na tela, no canto inferior esquerdo.
 * O cabeçalho é fixo e a placa é da cena: quem cede é a placa.
 */
export function posicaoDaPlaca(
  tela: Janela,
  cabecalhoAtivo: boolean,
): { x: number; y: number; dentroDaTela: boolean } {
  const acima = { x: tela.x, y: tela.y - ALTURA_DA_PLACA - FOLGA_DA_PLACA, dentroDaTela: false };
  if (!cabecalhoAtivo) return acima;
  const direitaDoCabecalho = CABECALHO_HORIZONTAL.x + LARGURA_RESERVADA_DO_CABECALHO;
  const abaixoDoCabecalho = acima.y >= CABECALHO_HORIZONTAL.y + ALTURA_DO_CABECALHO + FOLGA_DA_PLACA;
  if (tela.x >= direitaDoCabecalho || abaixoDoCabecalho) return acima;
  if (tela.x + tela.w - direitaDoCabecalho >= LARGURA_MINIMA_DA_PLACA) {
    return { ...acima, x: direitaDoCabecalho };
  }
  return {
    x: tela.x + RECUO_DA_PLACA_DENTRO_DA_TELA,
    y: tela.y + tela.h - ALTURA_DA_PLACA - RECUO_DA_PLACA_DENTRO_DA_TELA,
    dentroDaTela: true,
  };
}

/** Quanto a janela do short recua da borda do quadro no estilo limpo. */
export const CONTORNO_DO_SHORT = 32;
/** Quanto cada janela recua de uma vizinha (o vão entre as duas é o dobro). */
export const VAO_ENTRE_JANELAS = 12;

/**
 * A janela do short com o contorno do estilo limpo.
 *
 * Uma janela que encosta na borda do quadro (a de baixo da empilhada, a cheia)
 * recua dela, e o fundo aparece em volta como um contorno; duas janelas que se
 * tocam abrem um vão. Só o BURACO do palco encolhe: o vídeo continua no mesmo
 * slot por baixo, e o PNG cobre a borda dele. Por isso nada muda no FFmpeg nem
 * no domínio — o contorno é desenho, não geometria.
 */
export function janelaComContorno(
  janela: Janela,
  janelas: Janela[],
  canvasW: number,
  canvasH: number,
  contorno: number = CONTORNO_DO_SHORT,
): Janela {
  const tocaOutra = (lado: "cima" | "baixo") =>
    janelas.some((outra) => {
      if (outra === janela) return false;
      const cruzaNaHorizontal = outra.x < janela.x + janela.w && janela.x < outra.x + outra.w;
      if (!cruzaNaHorizontal) return false;
      return lado === "cima"
        ? Math.abs(outra.y + outra.h - janela.y) <= 2
        : Math.abs(janela.y + janela.h - outra.y) <= 2;
    });
  const recuo = (naBorda: boolean, naVizinha: boolean) =>
    naBorda ? contorno : naVizinha ? Math.min(VAO_ENTRE_JANELAS, contorno) : 0;
  const esquerda = recuo(janela.x <= 1, false);
  const direita = recuo(janela.x + janela.w >= canvasW - 1, false);
  const cima = recuo(janela.y <= 1, tocaOutra("cima"));
  const baixo = recuo(janela.y + janela.h >= canvasH - 1, tocaOutra("baixo"));
  return {
    x: janela.x + esquerda,
    y: janela.y + cima,
    w: janela.w - esquerda - direita,
    h: janela.h - cima - baixo,
  };
}

/** Onde o cabeçalho do short senta, ou null quando não há faixa para ele. */
export function posicaoDoCabecalhoNoShort(primeiraJanela: Janela | undefined): { x: number; y: number } | null {
  if (!primeiraJanela || primeiraJanela.y < FAIXA_MINIMA_PARA_O_CABECALHO) return null;
  return { x: CABECALHO_SHORT_X, y: primeiraJanela.y - FOLGA_DO_CABECALHO_NO_SHORT };
}

/** O que os cálculos de posição leem — o render e a prévia têm tipos próprios do resto. */
export interface ComPosicoes {
  cabecalho: { ativo: boolean; posicao?: PosicaoDoComponente; posicao_short?: PosicaoDoComponente };
  placa: { posicao?: PosicaoDoComponente };
}

/** Onde o cabeçalho senta no horizontal: o que o canal escolheu, ou o canto de sempre. */
export function posicaoDoCabecalho(componentes: ComPosicoes): { x: number; y: number } {
  const posicao = componentes.cabecalho.posicao;
  if (!posicao || posicao.automatica) return { ...CABECALHO_HORIZONTAL };
  return { x: posicao.x, y: posicao.y };
}

/** Onde o cabeçalho senta no short: o que o canal escolheu, ou a faixa acima da 1ª janela. */
export function posicaoDoCabecalhoNoShortDe(
  componentes: ComPosicoes,
  primeiraJanela: Janela | undefined,
): { x: number; y: number } | null {
  if (!componentes.cabecalho.ativo) return null;
  const posicao = componentes.cabecalho.posicao_short;
  if (posicao && !posicao.automatica) return { x: posicao.x, y: posicao.y };
  return posicaoDoCabecalhoNoShort(primeiraJanela);
}

/** Onde a placa senta: a que o canal fixou, ou a regra automática (`posicaoDaPlaca`). */
export function posicaoDaPlacaDe(
  componentes: ComPosicoes,
  tela: Janela,
): { x: number; y: number; dentroDaTela: boolean } {
  const posicao = componentes.placa.posicao;
  if (posicao && !posicao.automatica) return { x: posicao.x, y: posicao.y, dentroDaTela: false };
  return posicaoDaPlaca(tela, componentes.cabecalho.ativo);
}
