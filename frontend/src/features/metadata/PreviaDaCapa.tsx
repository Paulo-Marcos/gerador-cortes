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

// As medidas da prévia (a proporção do quadro e a faixa segura) são geometria de execução:
// entram como variáveis CSS e a aparência fica nas classes (DIRECAO §9.2, estiloInline).
export function PreviaDaCapa({
  painel,
  etiqueta,
  arte,
  onSoltar,
}: {
  painel: PainelDaCapa;
  etiqueta: string;
  /** A arte do corte em data URI, do GET do painel. */
  arte: string;
  onSoltar: (componente: ComponenteDaCapa, retangulo: Retangulo) => void;
}) {
  const { quadro, faixa_segura: seguro } = painel;
  const medidas = {
    '--razao': `${quadro.largura} / ${quadro.altura}`,
    '--topo': pct(seguro.y, quadro.altura),
    '--base': pct(quadro.altura - seguro.y - seguro.h, quadro.altura),
  } as React.CSSProperties;
  return (
    <div
      className="relative aspect-[var(--razao)] w-[300px] shrink-0 overflow-hidden rounded-[10px] border border-fio-2"
      style={medidas}
    >
      <Thumbnail
        component={CapaTikTok}
        inputProps={propsDaPrevia(painel, etiqueta, arte)}
        compositionWidth={LARGURA_DA_CAPA}
        compositionHeight={ALTURA_DA_CAPA}
        frameToDisplay={0}
        durationInFrames={1}
        fps={30}
        className="absolute inset-0 size-full"
      />
      {/* A vitrine do perfil: véu no que ela corta e a etiqueta. Só o traço não
          bastava — o título e o @ encostam no limite, e as bordas dos blocos o
          cobriam. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[var(--topo)] bg-veu" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--base)] bg-veu" />
      <span className="num pointer-events-none absolute right-1 top-[calc(var(--topo)-18px)] rounded-etiqueta bg-iris px-1 text-micro text-sobre-iris">
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
