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
  COMPONENTES_PADRAO as COMPONENTES_PADRAO_DO_RENDERER,
  COR_DO_ACENTO,
  COR_DO_FUNDO,
  COR_DO_TEXTO,
  PlacaLimpa,
  RAIO_DA_FACECAM,
  RAIO_DA_JANELA_DO_SHORT,
  RAIO_DA_TELA,
  SombraDaJanela,
  posicaoDoCabecalhoNoShort,
  raioDaJanela,
  type Janela,
} from '@video-renderer/public-api';

/** O que o palco recebe do canal, já resolvido para a prévia (URL em vez de staticFile). */
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
}> = ({ x, y, nome, handle, imagemSrc }) => (
  <CabecalhoDoRenderer
    x={x}
    y={y}
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
