import { Clapperboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useElegibilidadeShorts,
  useGerarShortsManualmente,
} from '@/features/shorts/useFabricaDoCorte';
import { planoDaFabrica } from './planoFabricaShorts';

// D-472: a fábrica de shorts alcançável da tela do bruto.
//
// O disparo normal é automático, no fim da geração do bruto de um corte Fire.
// Este botão existe para os cortes que o automático não alcança: os que já
// tinham bruto antes da E-030, os que tiveram o bruto descartado, e o teste da
// esteira sem reprocessar a live inteira.
//
// Ele mora aqui, e não na tela de Shorts, por um motivo concreto: aquela tela
// lista só os Fires COM bruto em disco. Um corte antigo sem bruto não aparece
// lá — se o botão morasse na tela de Shorts, ele nunca alcançaria justamente os
// cortes para os quais foi feito.
//
// A seção some por completo quando o corte não é Fire. Oferecer uma ação que
// vai ser recusada é pior que não oferecer.

interface Props {
  corteId: string;
  /** Some enquanto outra operação do bruto está rodando. */
  ocupado?: boolean;
}

export function FabricaShortsSection({ corteId, ocupado = false }: Props) {
  const elegibilidade = useElegibilidadeShorts(corteId);
  const gerar = useGerarShortsManualmente(corteId);

  const plano = planoDaFabrica(elegibilidade.data);
  if (!plano.oferecer) return null;

  return (
    <div className="mt-1.5 border-t border-[var(--wb-border-soft)] pt-1.5">
      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-text-mute)]">
        Fábrica de shorts
      </p>

      {plano.avisos.map((aviso) => (
        <p
          key={aviso}
          className="px-1 pb-1 text-[11px] leading-tight text-[var(--wb-text-dim)]"
        >
          {aviso}
        </p>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={ocupado || gerar.isPending}
        onClick={() => gerar.mutate()}
      >
        {gerar.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Clapperboard size={13} />
        )}
        {plano.rotulo}
      </Button>

      {gerar.isSuccess && (
        <p className="px-1 pt-1 text-[11px] leading-tight text-[var(--wb-ok-ink)]">
          {gerar.data.shorts.length} candidato(s) na aba Shorts
          {gerar.data.bruto_regerado && ' · bruto refeito'}
        </p>
      )}
      {gerar.isError && (
        <p className="px-1 pt-1 text-[11px] leading-tight text-[var(--wb-text-dim)]">
          {(gerar.error as Error)?.message ?? 'nao consegui gerar'}
        </p>
      )}
    </div>
  );
}
