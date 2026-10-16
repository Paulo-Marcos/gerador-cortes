import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import type { RascunhoDoPalco } from '@/features/channels/PalcoComponentesSection';
import {
  ComponentesArrastaveis,
  type ComponenteDoPalco,
  type EdicaoDosComponentes,
} from '@/features/editor/fase2/ComponentesArrastaveis';
import { SeletorDeTextura } from './SeletorDeTextura';
import type { AtualizarShortBody, PlanoDesenhavel, ShortSugerido } from './shortsApi';

// D-937: o modal do palco do short separado por estilo. Antes as mesmas seções
// apareciam nos dois estilos — inclusive a textura do estilo antigo, que no
// limpo não muda nada no PNG — e as peças do limpo (fundo, cabeçalho, janelas)
// ficavam escondidas no fim. Agora cada estilo mostra só o que vale nele, e no
// limpo o cabeçalho também se arrasta e se redimensiona na prévia.

export const QUADRO_DO_SHORT = { largura: 1080, altura: 1920 };

/** O número de cada seção que aparece; a ausente não existe no estilo. */
export interface SecoesDoModal {
  moldura?: number;
  fundo?: number;
  palcoLimpo?: number;
  legenda: number;
  preset: number;
  janelasDoAtual?: number;
}

/**
 * As seções depois das três fixas (arranjo, janelas, tamanho), numeradas na
 * ordem em que aparecem. No preset não há moldura nem palco do corte.
 */
export function numerarSecoes({ emPreset, limpo }: { emPreset: boolean; limpo: boolean }): SecoesDoModal {
  if (emPreset) return { fundo: 4, legenda: 5, preset: 6 };
  if (limpo) return { moldura: 4, palcoLimpo: 5, legenda: 6, preset: 7 };
  return { moldura: 4, fundo: 5, legenda: 6, preset: 7, janelasDoAtual: 8 };
}

/** A textura editorial por trás das janelas — só existe no estilo antigo (D-552). */
export function TexturaDoAtual({
  short,
  plano,
  ocupado,
  onAplicar,
}: {
  short: ShortSugerido;
  plano: PlanoDesenhavel | null | undefined;
  ocupado: boolean;
  onAplicar: (body: AtualizarShortBody) => void;
}) {
  return (
    <>
      <SeletorDeTextura
        escolhida={short.fundo_editorial ?? ''}
        padrao={plano?.fundo_editorial ?? ''}
        ocupado={ocupado}
        onEscolher={(id) => onAplicar({ fundo_editorial: id })}
      />
      <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
        A textura do canal por trás das janelas. Aparece na prévia ao lado.
      </p>
    </>
  );
}

/** O cabeçalho do short limpo ligado ao rascunho: mover fixa a posição; a alça, o tamanho. */
export function edicaoDoCabecalhoNoShort(
  rascunho: RascunhoDoPalco,
  mudar: Dispatch<SetStateAction<RascunhoDoPalco | null>>,
  selecionado: ComponenteDoPalco | null,
  onSelecionar: (componente: ComponenteDoPalco) => void,
): EdicaoDosComponentes {
  return {
    escala: () => rascunho.cabecalhoEscala,
    mover: (_c, x, y) =>
      mudar((r) => (r ? { ...r, cabecalhoPosicaoShort: { automatica: false, x: Math.round(x), y: Math.round(y) } } : r)),
    escalar: (_c, cabecalhoEscala) => mudar((r) => (r ? { ...r, cabecalhoEscala } : r)),
    selecionado,
    onSelecionar,
  };
}

/** O cabeçalho arrastável sobre a prévia do short (só no limpo, fora do modo de mover janelas). */
export function CabecalhoArrastavelNoShort({
  palco,
  quadroRef,
}: {
  palco: ReturnType<typeof usePalcoDoModal>;
  quadroRef: RefObject<HTMLDivElement | null>;
}) {
  const [selecionado, setSelecionado] = useState<ComponenteDoPalco | null>(null);
  if (!palco.rascunho || palco.rascunho.estilo !== 'limpo' || !palco.rascunho.cabecalhoAtivo) return null;
  const edicao = edicaoDoCabecalhoNoShort(palco.rascunho, palco.mudar, selecionado, setSelecionado);
  return <ComponentesArrastaveis frameRef={quadroRef} edicao={edicao} quadro={QUADRO_DO_SHORT} />;
}
