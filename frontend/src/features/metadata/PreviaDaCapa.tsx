import { Thumbnail } from '@remotion/player';
import { ALTURA_DA_CAPA, CapaTikTok, LARGURA_DA_CAPA } from '@video-renderer/public-api';
import { BlocosArrastaveis } from '@/features/shorts/BlocosArrastaveis';
import type { Retangulo } from '@/features/shorts/arrastarSlot';
import type { ComponenteDaCapa } from '@/types/presets';
import { blocosVisiveis, NOMES_DOS_COMPONENTES, propsDaPrevia, type PainelDaCapa } from './estiloDaCapa';

// D-933: a prévia do modal "Estilizar capa". Não é um desenho parecido: é a
// MESMA composição que o gerador rasteriza (`CapaTikTok`, pela porta pública do
// renderer), num `Thumbnail` do Remotion. Por cima, os blocos arrastáveis e a
// guia do recorte da vitrine do perfil (D-536).

const pct = (valor: number, total: number) => `${(valor / total) * 100}%`;

export function PreviaDaCapa({
  painel,
  etiqueta,
  onSoltar,
}: {
  painel: PainelDaCapa;
  etiqueta: string;
  onSoltar: (componente: ComponenteDaCapa, retangulo: Retangulo) => void;
}) {
  const { quadro, faixa_segura: seguro } = painel;
  return (
    <div
      className="relative w-[300px] shrink-0 overflow-hidden rounded-[10px] border border-[var(--wb-border)]"
      style={{ aspectRatio: `${quadro.largura} / ${quadro.altura}` }}
    >
      <Thumbnail
        component={CapaTikTok}
        inputProps={propsDaPrevia(painel, etiqueta)}
        compositionWidth={LARGURA_DA_CAPA}
        compositionHeight={ALTURA_DA_CAPA}
        frameToDisplay={0}
        durationInFrames={1}
        fps={30}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {/* A vitrine do perfil: véu no que ela corta e a etiqueta. Só o traço não
          bastava — o título e o @ encostam no limite, e as bordas dos blocos o
          cobriam. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-[color-mix(in_oklch,var(--wb-bg)_55%,transparent)]"
        style={{ height: pct(seguro.y, quadro.altura) }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color-mix(in_oklch,var(--wb-bg)_55%,transparent)]"
        style={{ height: pct(quadro.altura - seguro.y - seguro.h, quadro.altura) }}
      />
      <span
        className="pointer-events-none absolute right-1 rounded-[4px] bg-[var(--wb-accent)] px-1 font-code text-[11px] font-bold uppercase text-[var(--wb-accent-fg)]"
        style={{ top: `calc(${pct(seguro.y, quadro.altura)} - 18px)` }}
      >
        vitrine
      </span>
      <BlocosArrastaveis
        blocos={blocosVisiveis(painel)}
        limites={{ largura: quadro.largura, altura: quadro.altura }}
        rotulo={(regiao) => NOMES_DOS_COMPONENTES[regiao as ComponenteDaCapa] ?? regiao}
        substantivo="o componente"
        onSoltar={(regiao, retangulo) => onSoltar(regiao as ComponenteDaCapa, retangulo)}
      />
    </div>
  );
}
