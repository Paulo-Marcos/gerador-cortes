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

export interface ComponentesDoPalco {
  estilo: "atual" | "limpo";
  cabecalho: { ativo: boolean; nome: string; handle: string; imagem: string };
  placa: { ativo: boolean };
}

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
}> = ({ x, y, nome, handle, imagem }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
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
}> = ({ x, y, nome, papel, sobreVideo = false }) => {
  if (!nome && !papel) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
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

/** Onde o cabeçalho do short senta, ou null quando não há faixa para ele. */
export function posicaoDoCabecalhoNoShort(primeiraJanela: Janela | undefined): { x: number; y: number } | null {
  if (!primeiraJanela || primeiraJanela.y < FAIXA_MINIMA_PARA_O_CABECALHO) return null;
  return { x: CABECALHO_SHORT_X, y: primeiraJanela.y - FOLGA_DO_CABECALHO_NO_SHORT };
}
