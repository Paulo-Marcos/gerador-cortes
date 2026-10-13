import type { FC, ReactNode } from 'react';

// ESPELHO de `video-renderer/src/youtube-bg/palco-limpo.tsx` (D-911): o palco
// "limpo" — fundo chapado, janelas com cantos arredondados, cabeçalho do canal
// e placa em texto. O renderer rasteriza o PNG do palco com a cópia de lá; a
// prévia desenha com esta. Os NÚMEROS têm de ser os mesmos nos dois lados.

export const COR_DO_FUNDO = '#121417';
export const COR_DO_TEXTO = '#F3F2EE';
export const COR_DO_ACENTO = '#FF6E5A';

export const RAIO_DA_TELA = 20;
export const RAIO_DA_FACECAM = 14;
export const RAIO_DA_JANELA_DO_SHORT = 24;

const SOMBRA_DA_JANELA = 'drop-shadow(0 30px 60px rgba(0,0,0,0.45))';

export const CABECALHO_HORIZONTAL = { x: 64, y: 64 } as const;
export const ALTURA_DO_CABECALHO = 44;
export const CABECALHO_SHORT_X = 48;
const FOLGA_DO_CABECALHO_NO_SHORT = 120;
const FAIXA_MINIMA_PARA_O_CABECALHO = 200;

export const ALTURA_DA_PLACA = 56;

const FONTE = "'Inter', 'Segoe UI', sans-serif";

/** O que o palco recebe do canal (espelha `PalcoComponentesResponse` resolvido). */
export interface ComponentesDoPalco {
  estilo: 'atual' | 'limpo';
  cabecalho: { ativo: boolean; nome: string; handle: string; imagemUrl: string };
  placa: { ativo: boolean };
}

export const COMPONENTES_PADRAO: ComponentesDoPalco = {
  estilo: 'atual',
  cabecalho: { ativo: true, nome: '', handle: '', imagemUrl: '' },
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

/** A sombra em volta da janela (o corpo é o que o vídeo ocupa). */
export const SombraDaJanela: FC<{ janela: Janela; raio: number }> = ({ janela, raio }) => (
  <div
    style={{
      position: 'absolute',
      left: janela.x,
      top: janela.y,
      width: janela.w,
      height: janela.h,
      filter: SOMBRA_DA_JANELA,
    }}
  >
    <div style={{ position: 'absolute', inset: 0, borderRadius: raio, background: 'black' }} />
  </div>
);

/** A janela da prévia: recorta o vídeo com os cantos do estilo limpo e leva a sombra. */
export const JanelaLimpa: FC<{ janela: Janela; raio: number; children: ReactNode }> = ({
  janela,
  raio,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: janela.x,
      top: janela.y,
      width: janela.w,
      height: janela.h,
      filter: SOMBRA_DA_JANELA,
    }}
  >
    <div style={{ position: 'absolute', inset: 0, borderRadius: raio, overflow: 'hidden', background: 'black' }}>
      {children}
    </div>
  </div>
);

export const CabecalhoDoCanal: FC<{
  x: number;
  y: number;
  nome: string;
  handle: string;
  imagemSrc?: string;
}> = ({ x, y, nome, handle, imagemSrc }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      height: ALTURA_DO_CABECALHO,
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      fontFamily: FONTE,
      color: COR_DO_TEXTO,
      whiteSpace: 'nowrap',
    }}
  >
    {imagemSrc ? (
      <img
        src={imagemSrc}
        alt=""
        style={{
          width: ALTURA_DO_CABECALHO,
          height: ALTURA_DO_CABECALHO,
          borderRadius: '50%',
          objectFit: 'cover',
          flex: '0 0 auto',
        }}
      />
    ) : null}
    {nome ? (
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1 }}>{nome}</div>
    ) : null}
    {handle ? (
      <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1, color: 'rgba(243,242,238,0.55)' }}>
        {handle}
      </div>
    ) : null}
  </div>
);

export const PlacaLimpa: FC<{ x: number; y: number; nome?: string; papel?: string }> = ({
  x,
  y,
  nome,
  papel,
}) => {
  if (!nome && !papel) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        height: ALTURA_DA_PLACA,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontFamily: FONTE,
        whiteSpace: 'nowrap',
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

/** Onde o cabeçalho do short senta, ou null quando não há faixa para ele. */
export function posicaoDoCabecalhoNoShort(
  primeiraJanela: Janela | undefined,
): { x: number; y: number } | null {
  if (!primeiraJanela || primeiraJanela.y < FAIXA_MINIMA_PARA_O_CABECALHO) return null;
  return { x: CABECALHO_SHORT_X, y: primeiraJanela.y - FOLGA_DO_CABECALHO_NO_SHORT };
}
