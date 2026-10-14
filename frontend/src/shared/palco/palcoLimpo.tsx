import type { FC, ReactNode } from 'react';
import {
  ALTURA_DO_CABECALHO,
  CabecalhoDoCanal as CabecalhoDoRenderer,
  SOMBRA_DA_JANELA,
} from '@video-renderer/public-api';

// D-911: o palco "limpo" da prévia. Diferente do chrome atual (que tem uma
// cópia por projeto), aqui NÃO há espelho: o módulo do renderer
// (`youtube-bg/palco-limpo.tsx`, pela porta pública) só usa React, então a prévia monta os mesmos
// componentes e lê as mesmas constantes. Uma cor ou um raio mudam num lugar só.
// O que fica aqui é o que só a prévia precisa: a janela que recorta o vídeo
// (no PNG a janela é um buraco) e a imagem do cabeçalho por URL (no PNG ela
// vem do `staticFile`).

export {
  ALTURA_DA_PLACA,
  ALTURA_DO_CABECALHO,
  CABECALHO_HORIZONTAL,
  CABECALHO_SHORT_X,
  CONTORNO_DO_SHORT,
  COMPONENTES_PADRAO as COMPONENTES_PADRAO_DO_RENDERER,
  COR_DO_ACENTO,
  COR_DO_FUNDO,
  COR_DO_TEXTO,
  FUNDO_PADRAO_DO_LIMPO,
  FUNDOS_DO_LIMPO,
  FundoLimpo,
  PlacaLimpa,
  RAIO_DA_FACECAM,
  RAIO_DA_JANELA_DO_SHORT,
  RAIO_DA_TELA,
  SombraDaJanela,
  janelaComContorno,
  posicaoDaPlaca,
  posicaoDaPlacaDe,
  posicaoDoCabecalho,
  posicaoDoCabecalhoNoShortDe,
  posicaoDoCabecalhoNoShort,
  raioDaJanela,
  type FundoDoLimpo,
  type Janela,
  type PosicaoDoComponente,
} from '@video-renderer/public-api';

/** Onde um componente senta (px do quadro); `automatica` = a regra do estilo. */
interface Posicao {
  automatica: boolean;
  x: number;
  y: number;
}

/** O que o palco recebe do canal, já resolvido para a prévia (URL em vez de staticFile). */
export interface ComponentesDoPalco {
  estilo: 'atual' | 'limpo';
  cabecalho: {
    ativo: boolean;
    nome: string;
    handle: string;
    imagemUrl: string;
    escala: number;
    posicao: Posicao;
    posicao_short: Posicao;
  };
  placa: { ativo: boolean; escala: number; posicao: Posicao };
  /** O fundo do estilo limpo (`FUNDOS_DO_LIMPO`). */
  fundo: string;
  /** Quanto as janelas do short recuam das bordas (px); 0 = sem contorno. */
  contorno_short: number;
  /** D-913: o que o short mostra em volta das janelas: o fundo do palco ou o eco do vídeo. */
  fundo_short: 'palco' | 'eco';
  /** D-913: a legenda do short com contorno (o de sempre) ou só sombra. */
  estilo_da_legenda: 'contorno' | 'sombra';
}

export const COMPONENTES_PADRAO: ComponentesDoPalco = {
  estilo: 'atual',
  cabecalho: {
    ativo: true,
    nome: '',
    handle: '',
    imagemUrl: '',
    escala: 1,
    posicao: { automatica: false, x: 64, y: 64 },
    posicao_short: { automatica: true, x: 0, y: 0 },
  },
  placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
  fundo: 'reticula-aurora',
  contorno_short: 32,
  fundo_short: 'palco',
  estilo_da_legenda: 'contorno',
};

/** A janela da prévia: recorta o vídeo com os cantos do estilo limpo e leva a sombra. */
export const JanelaLimpa: FC<{
  janela: { x: number; y: number; w: number; h: number };
  raio: number;
  children: ReactNode;
}> = ({ janela, raio, children }) => (
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
    <div style={{ position: 'absolute', inset: 0, borderRadius: raio, overflow: 'hidden' }}>
      {children}
    </div>
  </div>
);

/** O cabeçalho do renderer com a imagem por URL (a prévia não tem `staticFile`). */
export const CabecalhoDoCanal: FC<{
  x: number;
  y: number;
  nome: string;
  handle: string;
  imagemSrc?: string;
  escala?: number;
}> = ({ x, y, nome, handle, imagemSrc, escala }) => (
  <CabecalhoDoRenderer
    x={x}
    y={y}
    escala={escala}
    nome={nome}
    handle={handle}
    imagem={
      imagemSrc ? (
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
      ) : null
    }
  />
);

/** D-913: o short leva o eco do vídeo nas faixas (só no estilo limpo, como no render). */
export function temEcoNoShort(componentes: ComponentesDoPalco): boolean {
  return componentes.estilo === 'limpo' && componentes.fundo_short === 'eco';
}
